import { status } from "elysia"

import { type TPlanner } from "@/models/planner.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { areAllowanceParticipantsResolved } from "@/modules/participant/logic.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS } from "@/utils/status/status.js"

import { getPlannerStatuses, isApproverOfAnyJv, shouldResetOtherJvs, validateJvAction } from "./logic.js"
import {
  findPlannerByDocumentId,
  findPlannerJvs,
  getApproverList,
  resetOtherJvsStatus,
  updateJvApprovalStatus,
  updateJvRejectionStatus,
  updatePlannerStatus,
} from "./store.js"
import {
  type TApproveJVParams,
  type TProcessJvApprovalParams,
  type TRejectJVParams,
  type TUpdateJvRejectionParams,
} from "./type.js"

export async function getAllJvsByDocumentId(documentId: string) {
  return await findPlannerJvs(documentId)
}

export async function approveJV({ documentId, jvs, me }: TApproveJVParams) {
  try {
    const rawPlanner = await findPlannerByDocumentId(documentId)
    if (!rawPlanner) {
      return status(404, {
        success: false,
        message: "ไม่พบแผนงานที่ระบุ",
      })
    }

    let currentPlanner = rawPlanner

    // A failure between the JV write and the planner-status write leaves every JV approved while the
    // planner still sits in WAITING_JV_APPROVAL, and validateJvAction then rejects every retry with
    // "already approved" — the planner can never advance. Reconcile that state instead of erroring.
    if (
      currentPlanner.jvs.length > 0 &&
      currentPlanner.jvs.every((item) => item.status === STATUS.JV_APPROVED) &&
      getPlannerStatuses(currentPlanner).includes(STATUS.WAITING_JV_APPROVAL)
    ) {
      // Reached before validateJvAction, so the per-JV approver check has not run yet: require the
      // caller to approve at least one of this planner's JVs before letting them close it out.
      const canFinalize = await isApproverOfAnyJv(
        currentPlanner.jvs.map((item) => item.taxId),
        me.userId
      )

      if (!canFinalize) {
        return status(403, {
          success: false,
          message: "คุณไม่มีสิทธิ์อนุมัติ JV นี้",
        })
      }

      await finalizeJvApproval(documentId, currentPlanner as TPlanner, me.userId)

      return status(200, {
        success: true,
        message: "อนุมัติ JV สำเร็จ",
      })
    }

    const requestTaxIds = new Set(jvs.map((item) => item.taxId))

    const changedTaxIds = getChangedTaxIds(currentPlanner, jvs)

    const resetJvTaxIds =
      changedTaxIds.length > 0
        ? currentPlanner.jvs.filter((item) => !requestTaxIds.has(item.taxId)).map((item) => item.taxId)
        : []

    // Validate every requested JV before mutating anything: resetOtherJvsStatus clears approvals on
    // the JVs outside the request, so a validation failure after it would leave them un-approved with
    // nothing to roll it back.
    const validatedJvs: Omit<TProcessJvApprovalParams, "documentId" | "me">[] = []

    for (const { taxId, ratio } of jvs) {
      const { ok, error, errorCode, jv } = await validateJvAction(currentPlanner, taxId, me.userId, "APPROVE")

      if (!ok || !jv) {
        return status(errorCode || 400, {
          success: false,
          message: error || "เกิดข้อผิดพลาดในการตรวจสอบ",
        })
      }

      validatedJvs.push({ taxId, ratio, jv })
    }

    if (resetJvTaxIds.length > 0) {
      await resetOtherJvsStatus({
        documentId,
        taxIds: resetJvTaxIds,
      })
    }

    for (const { taxId, ratio, jv } of validatedJvs) {
      const updatedPlanner = await processJvApproval({
        documentId,
        taxId,
        jv,
        ratio,
        me,
      })

      await workflowEventDispatcher
        .dispatch({
          type: "GM_JV_APPROVED",
          payload: {
            plannerBefore: currentPlanner as TPlanner,
            plannerAfter: updatedPlanner as TPlanner,
          },
          meta: {
            actorAccountId: me.userId,
            jvTaxId: taxId,
          },
        })
        .catch((error) => {
          console.error("Failed to record GM JV approved workflow event:", error)
        })

      if (changedTaxIds.length > 0 && resetJvTaxIds.length > 0) {
        await workflowEventDispatcher
          .dispatch({
            type: "GM_JV_REAPPROVAL_REQUIRED",
            payload: {
              plannerBefore: currentPlanner as TPlanner,
              plannerAfter: updatedPlanner as TPlanner,
            },
            meta: {
              actorAccountId: me.userId,
              triggeringJvTaxId: taxId,
              resetJvTaxIds,
            },
          })
          .catch((error) => {
            console.error("Failed to record GM JV reapproval workflow event:", error)
          })
      }

      currentPlanner = updatedPlanner
    }

    if (currentPlanner.jvs.some((j: TPlanner["jvs"][number]) => j.status !== STATUS.JV_APPROVED)) {
      return status(200, {
        success: true,
        message: "อนุมัติ JV สำเร็จ แต่ยังมี JV ที่รอการอนุมัติ",
      })
    }

    await finalizeJvApproval(documentId, currentPlanner as TPlanner, me.userId)

    return status(200, {
      success: true,
      message: "อนุมัติ JV สำเร็จ",
    })
  } catch (error) {
    return status(500, {
      success: false,
      message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
    })
  }
}

export async function rejectJV({ documentId: documentID, jvs, me }: TRejectJVParams) {
  try {
    const rawPlanner = await findPlannerByDocumentId(documentID)

    if (!rawPlanner) {
      return status(404, {
        success: false,
        message: "ไม่พบแผนงานที่ระบุ",
      })
    }

    let currentPlanner = rawPlanner

    const rejectedEvents: { taxId: string; reason: string; plannerBefore: TPlanner }[] = []

    for (const { taxId, reason } of jvs) {
      const { ok, error, errorCode, jv } = await validateJvAction(currentPlanner, taxId, me.userId, "REJECT")

      if (!ok || !jv) {
        return status(errorCode || 400, {
          success: false,
          message: error || "เกิดข้อผิดพลาดในการตรวจสอบ",
        })
      }

      const updated = await processJvRejection({
        documentId: documentID,
        taxId,
        jv,
        reason,
        me,
      })

      if (!updated) {
        return status(404, {
          success: false,
          message: "อัปเดตข้อมูลไม่สำเร็จ",
        })
      }

      rejectedEvents.push({
        taxId,
        reason,
        plannerBefore: currentPlanner as TPlanner,
      })

      currentPlanner = updated
    }

    const nextStatus = moveStatusForward(
      getPlannerStatuses(currentPlanner),
      PLANNER_ACTIONS.JV_REJECT,
      STATUS.WAITING_JV_APPROVAL
    )

    let finalPlanner = currentPlanner

    if (nextStatus.length > 0) {
      const updatedFinalPlanner = await updatePlannerStatus(documentID, nextStatus)
      if (updatedFinalPlanner) {
        finalPlanner = updatedFinalPlanner
      }
    }

    for (const event of rejectedEvents) {
      await workflowEventDispatcher
        .dispatch({
          type: "GM_JV_REJECTED",
          payload: {
            plannerBefore: event.plannerBefore,
            plannerAfter: finalPlanner as TPlanner,
          },
          meta: {
            actorAccountId: me.userId,
            jvTaxId: event.taxId,
            rejectionReason: event.reason,
          },
        })
        .catch((error) => {
          console.error("Failed to record GM JV rejected workflow event:", error)
        })
    }

    return status(200, {
      success: true,
      message: "ปฏิเสธ JV สำเร็จ",
    })
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการปฏิเสธ JV",
    })
  }
}

// ================= Helpers =================

async function finalizeJvApproval(documentId: string, plannerBefore: TPlanner, actorAccountId: string) {
  const finalStatus = moveStatusForward(
    getPlannerStatuses(plannerBefore),
    PLANNER_ACTIONS.JV_APPROVE,
    STATUS.WAITING_JV_APPROVAL
  )

  // Open the claim-allowance track only when allowance work is still outstanding: there is at least
  // one claimer AND some claimed month is not yet terminal. If every claimer already settled before
  // JV approval (all months Approve/Reject/Cancel — pending states do not count), the planner starts
  // with only the other two tracks.
  const hasAllowanceClaimer = plannerBefore.participants.some((p) => p.isAllowance)
  const needsClaimAllowance = hasAllowanceClaimer && !areAllowanceParticipantsResolved(plannerBefore.participants)
  const gatedStatus = needsClaimAllowance
    ? finalStatus
    : finalStatus.filter((s) => s !== STATUS.WAITING_CLAIM_ALLOWANCE)

  const plannerAfterFinalApproval = await updatePlannerStatus(documentId, gatedStatus)

  if (!plannerAfterFinalApproval) {
    throw new Error("Failed to update planner final approval status")
  }

  await workflowEventDispatcher
    .dispatch({
      type: "PLANNER_FULLY_APPROVED",
      payload: {
        plannerBefore,
        plannerAfter: plannerAfterFinalApproval as TPlanner,
      },
      meta: {
        actorAccountId,
      },
    })
    .catch((error) => {
      console.error("Failed to record planner fully approved workflow event:", error)
    })
}

async function processJvApproval({ jv, ratio, documentId, taxId, me }: TProcessJvApprovalParams) {
  const latestApprovers = await getApproverList(taxId)

  const [nextStatus] = moveStatusForward([jv.status], PLANNER_ACTIONS.APPROVE_ONE_JV, jv.status)

  if (nextStatus !== STATUS.JV_APPROVED) {
    throw new Error("Invalid next status for JV")
  }

  const updatedPlanner = await updateJvApprovalStatus({
    documentId,
    taxId,
    jvStatus: nextStatus,
    ratio,
    me,
    approversList: latestApprovers,
  })

  if (!updatedPlanner) {
    throw new Error("Failed to update JV in DB")
  }

  return updatedPlanner
}

async function processJvRejection({ documentId, taxId, jv, reason, me }: TUpdateJvRejectionParams) {
  const lastestApprovers = await getApproverList(jv.taxId)

  const [nextStatus] = moveStatusForward([jv.status], PLANNER_ACTIONS.JV_REJECT, jv.status)

  if (nextStatus !== STATUS.JV_REJECTED) {
    throw new Error("Invalid next status for JV")
  }

  const updatedPlanner = await updateJvRejectionStatus({
    documentId,
    taxId,
    reason,
    me,
    jvStatus: nextStatus,
    approversList: lastestApprovers,
  })

  if (!updatedPlanner) {
    throw new Error("Failed to update JV rejection in DB")
  }

  return updatedPlanner
}

export async function mapPlannerForView(planner: TPlanner[] | TPlanner): Promise<TPlanner[] | TPlanner> {
  const planners = Array.isArray(planner) ? planner : [planner]

  const mappedPlanners = await Promise.all(
    planners.map(async (p) => {
      const mappedJvs = await Promise.all(
        p.jvs.map(async (jv: any) => {
          let approversList = jv.approversList

          if (jv.status !== STATUS.JV_APPROVED && jv.status !== STATUS.JV_REJECTED) {
            const freshList = await getApproverList(jv.taxId)
            approversList = normalizeApproverList(freshList)
          }

          return {
            ...jv,
            approversList,
          }
        })
      )

      return {
        ...p,
        jvs: mappedJvs,
      }
    })
  )

  return Array.isArray(planner) ? mappedPlanners : mappedPlanners[0]!
}

type Approver = {
  employeeId: string[]
  nameTh: string
  accountId: string
}

function normalizeApproverList(list: any[]): Approver[] {
  return list.map((a) => ({
    nameTh: a.nameTh,
    accountId: a.accountId,
    employeeId: Array.isArray(a.employeeId) ? a.employeeId.map(String) : [String(a.employeeId)],
  }))
}

function getChangedTaxIds(
  planner: TPlanner,
  jvs: { taxId: string; ratio: { percentage: number; expense: number } }[]
): string[] {
  return jvs
    .filter(({ taxId, ratio }) => {
      const oldJv = planner.jvs.find((j) => j.taxId === taxId)
      return oldJv && shouldResetOtherJvs(oldJv, ratio)
    })
    .map((j) => j.taxId)
}
