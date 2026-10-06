import { DateTime } from "luxon"

import { DigitalWorkflowData } from "@/models/digital-workflow-data.js"
import { type TPlanner } from "@/models/planner.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { pendingConfirmExpiryFrom } from "@/modules/participant/logic.js"
import * as ParticipantService from "@/modules/participant/service.js"
import * as ParticipantStore from "@/modules/participant/store.js"

import {
  extractAllowanceClaimsByPlanner,
  extractEmployeeId,
  extractPlannerDocNos,
  mapDocumentStatus,
  mergeClaimsIntoMonthsClaimed,
  PARTICIPANT_STATUS,
  toJsonDataMap,
  type ParticipantStatus,
} from "./logic.js"
import * as WebhookModel from "./model.js"
import * as WebhookStore from "./store.js"

export async function saveWebhookData(data: WebhookModel.WebhookBody) {
  const newData = new DigitalWorkflowData(data)
  await newData.save()
  return newData.toObject()
}

export interface PlannerUpdateResult {
  documentId: string
  status: "UPDATED" | "PLAN_NOT_FOUND" | "EMPLOYEE_NOT_IN_PLAN" | "NOT_ALLOWANCE_PARTICIPANT"
  allowanceUpdated?: boolean
}

export type ProcessResult =
  | { ok: false; code: 400; message: string }
  | { ok: true; results: PlannerUpdateResult[]; employeeId?: string; participantStatus?: ParticipantStatus }

// Scan the webhook's json_data for plannerDocNo{N} values, then update the
// matching Employee_ID's status in each referenced plan.
export async function processPlannerStatusUpdates(data: WebhookModel.WebhookBody): Promise<ProcessResult> {
  const map = toJsonDataMap(data.json_data)

  const docNos = extractPlannerDocNos(map)
  if (docNos.length === 0) {
    // No plannerDocNo carries a value -> nothing to update.
    return { ok: true, results: [] }
  }

  const participantStatus = mapDocumentStatus(data.document_status)
  if (!participantStatus) {
    return { ok: false, code: 400, message: "document_status ไม่ถูกต้อง" }
  }

  const employeeId = extractEmployeeId(map)
  if (!employeeId) {
    return { ok: false, code: 400, message: "ไม่พบ Employee_ID ในข้อมูล webhook" }
  }

  // Every round (W/R/C/Y) carries the claimed months as indexed rows, each row naming its own
  // plannerDocNo{N}: a plan only receives the months claimed on ITS rows, never another plan's.
  // The per-entry status comes from this round's status, and pending rounds stamp a 5-day confirm
  // deadline on each entry they touch.
  const claimsByPlanner = extractAllowanceClaimsByPlanner(map)
  const hasAnyClaimedAmount = [...claimsByPlanner.values()].some((planClaims) => planClaims.hasAnyAmount)

  // transaction_id identifies the source document. It is the second half of a claimed entry's key
  // (month, transaction_id), so a claim-bearing round with no id would silently collapse distinct
  // transactions into one entry. Reject it up front and write nothing. (Non-claim rounds — status
  // flips carrying no amounts — don't touch monthsClaimed, so they don't need an id.)
  const transactionId = typeof data.transaction_id === "string" ? data.transaction_id.trim() : ""
  if (hasAnyClaimedAmount && transactionId === "") {
    return { ok: false, code: 400, message: "ไม่พบ transaction_id ในข้อมูล webhook" }
  }

  const now = new Date()
  const isPending =
    participantStatus === PARTICIPANT_STATUS.PENDING_REJECT || participantStatus === PARTICIPANT_STATUS.PENDING_CANCEL
  const timer = isPending ? { at: now, expireAt: pendingConfirmExpiryFrom(now) } : null

  const results: PlannerUpdateResult[] = []
  for (const documentId of docNos) {
    const planner = await WebhookStore.findPlannerByDocumentId(documentId)
    if (!planner) {
      results.push({ documentId, status: "PLAN_NOT_FOUND" })
      continue
    }

    const participant = planner.participants.find((p) => p.employeeId.includes(employeeId))
    if (!participant) {
      results.push({ documentId, status: "EMPLOYEE_NOT_IN_PLAN" })
      continue
    }

    // This webhook only drives allowance claimers. A matched participant that isn't
    // flagged isAllowance is skipped (no status/amount change, no finalization).
    if (!participant.isAllowance) {
      results.push({ documentId, status: "NOT_ALLOWANCE_PARTICIPANT" })
      continue
    }

    // Persist the status flip and the claimed amounts in ONE write so no observer
    // (concurrent event, sweep, confirm API) can see the new status before the amounts land.
    const claims = claimsByPlanner.get(documentId)
    const allowance = claims?.hasAnyAmount
      ? {
          monthsClaimed: mergeClaimsIntoMonthsClaimed(
            participant.monthsClaimed ?? [],
            participant.months ?? [],
            claims.months,
            participantStatus,
            timer,
            transactionId
          ),
          isAllowance: true,
        }
      : undefined

    const shouldNotifyPendingOutcome =
      isPending &&
      (claims?.hasAnyAmount
        ? claims.months.some((claim) => {
            const previous = (participant.monthsClaimed ?? []).find(
              (existing) => existing.month === claim.month && existing.transaction_id === transactionId
            )
            const updated = allowance?.monthsClaimed.find(
              (existing) => existing.month === claim.month && existing.transaction_id === transactionId
            )
            return updated?.status === participantStatus && previous?.status !== participantStatus
          })
        : participant.status !== participantStatus)

    await ParticipantStore.setParticipantStatus(documentId, employeeId, participantStatus, allowance)

    if (shouldNotifyPendingOutcome && timer) {
      const plannerAfterPending = await ParticipantStore.findPlannerByDocumentId(documentId)
      if (plannerAfterPending) {
        await workflowEventDispatcher
          .dispatch({
            type:
              participantStatus === PARTICIPANT_STATUS.PENDING_CANCEL
                ? "ALLOWANCE_CLAIM_CANCELLED"
                : "ALLOWANCE_CLAIM_REJECTED",
            payload: {
              plannerBefore: planner as TPlanner,
              plannerAfter: plannerAfterPending as TPlanner,
            },
            meta: {
              actorAccountId: "SYSTEM:DIGITAL_WORKFLOW",
              affectedParticipantAccountId: participant.accountId,
              affectedParticipantEmployeeId: employeeId,
              transactionId,
              pendingConfirmExpireAt: timer.expireAt,
            },
          })
          .catch((error) => {
            console.error("Failed to record allowance pending outcome workflow event:", error)
          })
      }
    }

    // Re-evaluate the planner only after status + amount are persisted.
    await ParticipantService.finalizePlanner(documentId, { actorAccountId: "SYSTEM:DIGITAL_WORKFLOW" })

    results.push(
      allowance ? { documentId, status: "UPDATED", allowanceUpdated: true } : { documentId, status: "UPDATED" }
    )
  }

  return { ok: true, results, employeeId, participantStatus }
}

export async function getPlannerWelfareInfo(plannerDocNo: string) {
  const planner = await WebhookStore.findPlannerByDocumentId(plannerDocNo)
  if (!planner) {
    return null
  }
  if (!planner.dateRange || !planner.dateRange.from || !planner.dateRange.to) {
    return null
  }

  const plannerName = planner.name ?? ""
  const startDate = DateTime.fromJSDate(planner.dateRange.from).setZone("Asia/Bangkok").toFormat("yyyy-MM-dd") ?? ""
  const endDate = DateTime.fromJSDate(planner.dateRange.to).setZone("Asia/Bangkok").toFormat("yyyy-MM-dd") ?? ""

  return { plannerDocNo, plannerName, startDate, endDate }
}
