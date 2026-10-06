import { Planner } from "@/models/planner.js"
import { PARTICIPANT_STATUS, type IClaimedMonth, type ParticipantStatus } from "@/modules/webhook/logic.js"

// Transient month states that carry the 5-day confirm deadline.
const PENDING_STATUSES: ParticipantStatus[] = [PARTICIPANT_STATUS.PENDING_REJECT, PARTICIPANT_STATUS.PENDING_CANCEL]

export async function findPlannerByDocumentId(documentId: string) {
  return await Planner.findOne({ documentId }).lean()
}

// Webhook-driven write: the round's status plus, when the round carried amounts, the recomputed
// monthsClaimed (each month already carries its own per-month status + confirm deadline from the
// merge). Persisted in ONE update so no observer sees the status before the amounts land.
// Per-month terminal months are protected in mergeClaimsIntoMonthsClaimed (TERMINAL_PROTECTED), and
// finalizePlanner re-syncs participant.status from the month rollup right after this write — so the
// participant arrayFilter intentionally does NOT gate on terminal status (a fully-rejected
// participant must still be able to receive a brand-new month claim).
export async function setParticipantStatus(
  documentId: string,
  employeeId: string,
  status: ParticipantStatus,
  allowance?: { monthsClaimed: IClaimedMonth[]; isAllowance: boolean }
) {
  const set: Record<string, unknown> = { "participants.$[p].status": status }

  if (allowance) {
    set["participants.$[p].monthsClaimed"] = allowance.monthsClaimed
    set["participants.$[p].isAllowance"] = allowance.isAllowance
  }

  return await Planner.updateOne({ documentId }, { $set: set }, { arrayFilters: [{ "p.employeeId": employeeId }] })
}

// Re-sync each participant's denormalized rollup `status` to match its monthsClaimed. Called from
// finalizePlanner after a webhook/confirm/sweep so raw/edit reads (which use the stored field) agree
// with the GET list/detail rollup. Targets by employeeId overlap; the planner-level uniqueness
// invariant means each filter resolves to one participant. Idempotent.
export async function setParticipantStatuses(
  documentId: string,
  updates: Array<{ employeeId: string[]; status: string }>
): Promise<void> {
  const ops = updates
    .filter((u) => u.employeeId.length > 0)
    .map((u) => ({
      updateOne: {
        filter: { documentId },
        update: { $set: { "participants.$[p].status": u.status } },
        arrayFilters: [{ "p.employeeId": { $in: u.employeeId } }],
      },
    }))
  if (ops.length === 0) return
  await Planner.bulkWrite(ops)
}

// Shared per-MONTH confirm transition (used by BOTH the sweep and the confirm API): move claimed
// months from a transient pending status to its confirmed terminal, clearing that month's timer.
// `participantFilter` scopes the participant arrayFilter (the API targets one employeeId); null
// means all participants (the sweep, which scopes by expired deadline via `monthExtraFilter`).
// Idempotent: only matches months still in `fromStatus`, so a re-claimed/already-confirmed month is
// left untouched (multi-instance / overlapping-sweep safe).
export async function confirmPendingMonths(
  documentId: string,
  fromStatus: ParticipantStatus,
  toStatus: ParticipantStatus,
  participantFilter: Record<string, unknown> | null,
  monthExtraFilter: Record<string, unknown> = {}
) {
  const participantSegment = participantFilter ? "$[p]" : "$[]"
  const base = `participants.${participantSegment}.monthsClaimed.$[m]`

  const arrayFilters: Record<string, unknown>[] = []
  if (participantFilter) arrayFilters.push(participantFilter)
  arrayFilters.push({ "m.status": fromStatus, ...monthExtraFilter })

  return await Planner.updateOne(
    { documentId },
    {
      $set: {
        [`${base}.status`]: toStatus,
        [`${base}.pendingConfirmAt`]: null,
        [`${base}.pendingConfirmExpireAt`]: null,
      },
    },
    { arrayFilters }
  )
}

// Pre-webhook cancel: push a CANCEL entry for a month that has no claimed entry yet. The query filter
// re-checks "no entry for this month" atomically, so a webhook landing in between wins (matchedCount 0).
// Check matchedCount, not modifiedCount: timestamps always $set updatedAt, so modifiedCount stays 1.
export async function cancelPendingMonth(documentId: string, employeeId: string[], entry: IClaimedMonth) {
  return await Planner.updateOne(
    {
      documentId,
      participants: { $elemMatch: { employeeId: { $in: employeeId }, "monthsClaimed.month": { $ne: entry.month } } },
    },
    { $push: { "participants.$[p].monthsClaimed": entry } },
    { arrayFilters: [{ "p.employeeId": { $in: employeeId } }] }
  )
}

// Planners with at least one claimed MONTH in a pending state past its confirm deadline.
export async function findPlannersWithExpiredPending(now: Date) {
  return await Planner.find({
    "participants.monthsClaimed": {
      $elemMatch: { status: { $in: PENDING_STATUSES }, pendingConfirmExpireAt: { $lte: now } },
    },
  }).lean()
}

// Finalization write: persist the recomputed claimed-allowance total, plus the next status
// array only when the finalization transition changed it. allowanceClaimed is a full replace,
// so re-running the gate overwrites cleanly (idempotent, no double counting). jvRatios (indexed
// like planner.jvs) lands in the same update so status and ratios can never be observed apart.
export async function finalizePlannerState(
  documentId: string,
  allowanceClaimed: number,
  status?: string[],
  jvRatios?: Array<{ actualPercentageRatio: number; actualExpenseRatio: number }>
) {
  const set: Record<string, unknown> = { allowanceClaimed }
  if (status) set.status = status
  jvRatios?.forEach((ratio, idx) => {
    set[`jvs.${idx}.actualPercentageRatio`] = ratio.actualPercentageRatio
    set[`jvs.${idx}.actualExpenseRatio`] = ratio.actualExpenseRatio
  })
  return await Planner.findOneAndUpdate({ documentId }, { $set: set }, { new: true }).lean()
}
