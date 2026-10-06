import { type TPlanner } from "@/models/planner.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { PARTICIPANT_STATUS, type ParticipantStatus } from "@/modules/webhook/logic.js"
import { calculateActualCostRatio } from "@/utils/actualCost/actualCostRatio.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS, type PlannerStatus } from "@/utils/status/status.js"

import {
  areAllowanceParticipantsResolved,
  employeeIdsOverlap,
  PENDING_CONFIRM_TRANSITIONS,
  rollupParticipantStatus,
  sumClaimedAllowance,
} from "./logic.js"
import * as ParticipantStore from "./store.js"

function sameStatuses(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

// Single source of truth for the finalization rule. Called after any participant
// status change (webhook, confirm API, sweep). Idempotent: once the claim-allowance
// track is removed, re-firing CLAIM_ALLOWANCE is a no-op.
export async function finalizePlanner(
  documentId: string,
  context: { actorAccountId: string } = { actorAccountId: "SYSTEM" }
): Promise<void> {
  const planner = await ParticipantStore.findPlannerByDocumentId(documentId)
  if (!planner) return

  // Keep the denormalized participant.status in sync with the per-month rollup, so confirm/sweep/
  // webhook all leave a stored status matching monthsClaimed (raw/edit reads use the stored field;
  // GET list/detail already derive it). Runs unconditionally — before the gate's early return — and
  // only writes participants whose rollup actually differs from what is stored.
  const rollupUpdates = planner.participants
    .map((p) => ({ employeeId: p.employeeId, status: rollupParticipantStatus(p), prev: p.status }))
    .filter((u) => u.status !== u.prev)
    .map(({ employeeId, status }) => ({ employeeId, status }))
  if (rollupUpdates.length > 0) {
    await ParticipantStore.setParticipantStatuses(documentId, rollupUpdates)
  }

  if (!areAllowanceParticipantsResolved(planner.participants)) return

  // Gate passed: refresh the actual claimed-allowance total on every finalization (even when
  // the status no longer changes), so a re-triggered gate recomputes and overwrites cleanly.
  const allowanceClaimed = sumClaimedAllowance(planner.participants)

  const current = planner.status.map((s) => String(s) as PlannerStatus)
  const next = moveStatusForward(current, PLANNER_ACTIONS.CLAIM_ALLOWANCE, STATUS.WAITING_CLAIM_ALLOWANCE)
  const statusChanged = !sameStatuses(current, next)

  // When the allowance track is the LAST of the three parallel tracks to finish, the collapse to
  // GA_COMPLETED happens here — so this path must fill the JV actual-cost ratios, exactly like the
  // EMP-summary and GA-actual paths do when they collapse. On calc failure there is no requester
  // to surface a 500 to (webhook/sweep/confirm), so: log, persist the allowance total, and keep
  // the planner in WAITING_CLAIM_ALLOWANCE — the idempotent gate retries on the next trigger.
  let jvRatios: ReturnType<typeof calculateActualCostRatio> | undefined
  if (statusChanged && next.includes(STATUS.GA_COMPLETED)) {
    try {
      jvRatios = calculateActualCostRatio(planner.actualBudget, planner.jvs, allowanceClaimed)
    } catch (error) {
      console.error(`[finalize] JV actual-cost ratio calculation failed for planner ${documentId}:`, error)
      await ParticipantStore.finalizePlannerState(documentId, allowanceClaimed)
      return
    }
  }

  const plannerAfter = await ParticipantStore.finalizePlannerState(
    documentId,
    allowanceClaimed,
    statusChanged ? next : undefined,
    jvRatios
  )

  if (
    statusChanged &&
    plannerAfter &&
    !current.includes(STATUS.WAITING_PLANNER_COST_ANALYSIS) &&
    next.includes(STATUS.WAITING_PLANNER_COST_ANALYSIS)
  ) {
    await workflowEventDispatcher
      .dispatch({
        type: "PLANNER_READY_FOR_ANALYSIS",
        payload: {
          plannerBefore: planner as TPlanner,
          plannerAfter: plannerAfter as TPlanner,
        },
        meta: {
          actorAccountId: context.actorAccountId,
          triggerAction: "ALLOWANCE_RESOLVED",
        },
      })
      .catch((error) => {
        console.error("Failed to record allowance-resolved planner ready workflow event:", error)
      })
  }
}

// Outcome a confirm request targets. "Reject" confirms PENDING_REJECT -> REJECT,
// "Cancel" confirms PENDING_CANCEL -> CANCEL.
export type ConfirmType = "Reject" | "Cancel"
export type ConfirmPendingResult = { ok: false; code: 403 | 404 | 409; message: string } | { ok: true; message: string }

// The pending state that a given confirm type must find the participant in, and the terminal
// state it transitions to on success.
const CONFIRM_TARGETS: Record<ConfirmType, { from: ParticipantStatus; to: ParticipantStatus }> = {
  Reject: { from: PARTICIPANT_STATUS.PENDING_REJECT, to: PARTICIPANT_STATUS.REJECT },
  Cancel: { from: PARTICIPANT_STATUS.PENDING_CANCEL, to: PARTICIPANT_STATUS.CANCEL },
}

// Confirm API: immediately confirm a participant's pending outcome, skipping the 5-day wait. Runs
// the SAME per-month confirm transition the sweep uses. `month` (YYYY-MM) scopes it to one claimed
// month; omitted, it confirms EVERY same-type pending month of the matched participant. The
// request's employeeId array matches a participant by overlap; the planner-level uniqueness
// invariant (an id never appears in two participants) means a correct match resolves to exactly one.
export async function confirmPendingParticipant(
  documentId: string,
  employeeId: string[],
  type: ConfirmType,
  month?: string,
  actorAccountId: string = "SYSTEM"
): Promise<ConfirmPendingResult> {
  const planner = await ParticipantStore.findPlannerByDocumentId(documentId)
  if (!planner) {
    return { ok: false, code: 404, message: "ไม่พบแผนงานที่ระบุ" }
  }

  const matches = planner.participants.filter((p) => employeeIdsOverlap(p.employeeId, employeeId))
  if (matches.length === 0) {
    return { ok: false, code: 404, message: "ไม่พบผู้เข้าร่วมในแผนงาน" }
  }
  // More than one match violates the uniqueness invariant -> corrupt data. Never pick arbitrarily.
  if (matches.length > 1) {
    console.error(
      `[confirm-cancel] data-integrity violation: employeeId ${JSON.stringify(employeeId)} matched ` +
        `${matches.length} participants in planner ${documentId}`
    )
    return { ok: false, code: 409, message: "ข้อมูลผู้เข้าร่วมในแผนงานไม่ถูกต้อง (รหัสพนักงานซ้ำซ้อน)" }
  }

  const participant = matches[0]!
  const target = CONFIRM_TARGETS[type]
  const claimed = participant.monthsClaimed ?? []

  // Single-month path: confirm the named month. A month can now hold several entries (one per
  // transaction), so decide from ALL of them, not the first found. Confirming scopes by (month,
  // status): every entry of this month currently in `target.from` flips to `target.to`; entries in
  // any other status (a sibling APPROVE/WAIT, or the opposite pending type) are left untouched by
  // the arrayFilter. The client never sees transaction_id (the DTO collapses it away), so it cannot
  // — and does not need to — name a single transaction; confirming the month confirms that month's
  // pending outcome of the requested type.
  if (month !== undefined) {
    const entries = claimed.filter((m) => m.month === month)
    if (entries.length === 0) {
      return { ok: false, code: 404, message: "ไม่พบเดือนที่ระบุของผู้เข้าร่วม" }
    }
    const statuses = entries.map((m) => m.status)
    if (!statuses.includes(target.from)) {
      // Nothing pending of this type in the month. Already-terminal -> idempotent success (retry/
      // double-click safe); otherwise a real mismatch.
      if (statuses.includes(target.to)) {
        return { ok: true, message: "ผู้เข้าร่วมได้รับการยืนยันแล้ว" }
      }
      return { ok: false, code: 409, message: "สถานะของผู้เข้าร่วมไม่ตรงกับการยืนยันที่ร้องขอ" }
    }
    await ParticipantStore.confirmPendingMonths(
      documentId,
      target.from,
      target.to,
      { "p.employeeId": { $in: employeeId } },
      { "m.month": month }
    )
    await finalizePlanner(documentId, { actorAccountId })
    return { ok: true, message: "ยืนยันสถานะผู้เข้าร่วมสำเร็จ" }
  }

  // Aggregate path (no month): confirm EVERY same-type pending month of the participant.
  const monthStatuses = claimed.map((m) => m.status)
  if (!monthStatuses.includes(target.from)) {
    // Nothing pending of this type. Already-terminal -> idempotent success; otherwise a real mismatch.
    if (monthStatuses.includes(target.to)) {
      return { ok: true, message: "ผู้เข้าร่วมได้รับการยืนยันแล้ว" }
    }
    return { ok: false, code: 409, message: "สถานะของผู้เข้าร่วมไม่ตรงกับการยืนยันที่ร้องขอ" }
  }

  await ParticipantStore.confirmPendingMonths(documentId, target.from, target.to, {
    "p.employeeId": { $in: employeeId },
  })
  await finalizePlanner(documentId, { actorAccountId })

  return { ok: true, message: "ยืนยันสถานะผู้เข้าร่วมสำเร็จ" }
}

// Periodic sweep: confirm claimed MONTHS stuck in a pending state past their 5-day deadline
// (PENDING_REJECT -> REJECT, PENDING_CANCEL -> CANCEL), then re-evaluate each affected planner.
// Idempotent and safe to run concurrently — confirmPendingMonths only matches still-pending,
// past-deadline months, so a re-claimed month (whose timer was cleared) is left untouched.
export async function runPendingConfirmSweep(
  now: Date = new Date()
): Promise<{ plannersScanned: number; plannersModified: number }> {
  const planners = await ParticipantStore.findPlannersWithExpiredPending(now)

  let plannersModified = 0
  for (const planner of planners) {
    let modified = false
    for (const [from, to] of Object.entries(PENDING_CONFIRM_TRANSITIONS)) {
      const result = await ParticipantStore.confirmPendingMonths(
        planner.documentId,
        from as ParticipantStatus,
        to,
        null,
        {
          "m.pendingConfirmExpireAt": { $lte: now },
        }
      )
      if ((result.modifiedCount ?? 0) > 0) modified = true
    }
    if (modified) plannersModified += 1
    await finalizePlanner(planner.documentId, { actorAccountId: "SYSTEM:PENDING_CONFIRM_SWEEP" })
  }

  return { plannersScanned: planners.length, plannersModified }
}

// Cancel API: cancel one planned month's allowance claim BEFORE its webhook starts (the month is
// PENDING = planned in `months` but has no monthsClaimed entry yet). Records the month as CANCEL right
// away — no 5-day window — by pushing a zero-amount CANCEL entry. A later webhook for the same month
// carries its own transaction_id, so it lands as a separate entry and is not blocked by this one.
// Self-service only: the requester (actorAccountId) must be the matched participant.
export async function cancelAllowanceClaimed(
  documentId: string,
  employeeId: string[],
  month: string,
  actorAccountId: string
): Promise<ConfirmPendingResult> {
  const planner = await ParticipantStore.findPlannerByDocumentId(documentId)
  if (!planner) {
    return { ok: false, code: 404, message: "ไม่พบแผนงานที่ระบุ" }
  }

  const matches = planner.participants.filter((p) => employeeIdsOverlap(p.employeeId, employeeId))
  if (matches.length === 0) {
    return { ok: false, code: 404, message: "ไม่พบผู้เข้าร่วมในแผนงาน" }
  }
  if (matches.length > 1) {
    console.error(
      `[cancel-allowance-claimed] data-integrity violation: employeeId ${JSON.stringify(
        employeeId
      )} matched ${matches.length} participants in planner ${documentId}`
    )
    return { ok: false, code: 409, message: "ข้อมูลผู้เข้าร่วมในแผนงานไม่ถูกต้อง (รหัสพนักงานซ้ำซ้อน)" }
  }

  const participant = matches[0]!
  if (participant.accountId !== actorAccountId) {
    return { ok: false, code: 403, message: "ไม่มีสิทธิ์ยกเลิกการเบิกเบี้ยเลี้ยงของผู้อื่น" }
  }
  if (!participant.isAllowance) {
    return { ok: false, code: 409, message: "ผู้เข้าร่วมไม่ได้เบิกเบี้ยเลี้ยง" }
  }

  const planned = (participant.months ?? []).find((m) => m.month === month)
  if (!planned) {
    return { ok: false, code: 404, message: "ไม่พบเดือนที่ระบุของผู้เข้าร่วม" }
  }

  // Any entry for the month means its webhook already started — only PENDING months are cancellable.
  // All-CANCEL entries -> already cancelled -> idempotent success (retry/double-click safe).
  const entries = (participant.monthsClaimed ?? []).filter((m) => m.month === month)
  if (entries.length > 0) {
    if (entries.every((m) => m.status === PARTICIPANT_STATUS.CANCEL)) {
      return { ok: true, message: "ยกเลิกการเบิกเบี้ยเลี้ยงแล้ว" }
    }
    return { ok: false, code: 409, message: "เดือนที่ระบุเริ่มดำเนินการเบิกแล้ว ไม่สามารถยกเลิกได้" }
  }

  const result = await ParticipantStore.cancelPendingMonth(documentId, employeeId, {
    month,
    allowanceMonthly: planned.allowanceMonthly,
    allowanceDaily: planned.allowanceDaily,
    allowanceDays: planned.allowanceDays,
    allowanceClaimed: 0,
    allowanceAccum: planned.allowanceAccum,
    allowanceRemaining: planned.allowanceRemaining,
    status: PARTICIPANT_STATUS.CANCEL,
    pendingConfirmAt: null,
    pendingConfirmExpireAt: null,
    transaction_id: "",
  })
  // A webhook created an entry for this month between our read and write.
  if (result.matchedCount === 0) {
    return { ok: false, code: 409, message: "เดือนที่ระบุเริ่มดำเนินการเบิกแล้ว ไม่สามารถยกเลิกได้" }
  }

  await finalizePlanner(documentId, { actorAccountId })
  return { ok: true, message: "ยกเลิกการขออนุมัติสำเร็จ" }
}
