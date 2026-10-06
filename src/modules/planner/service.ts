import { type TCompanyMember } from "@/models/user.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { canCancelPlanner, canEditPlanner } from "@/modules/permission/service.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS, type PlannerStatus } from "@/utils/status/status.js"

import { mapPlannerForView } from "../jv/service.js"
import { buildPlannerUpdate } from "./allowance-logic.js"
import * as PlannerModel from "./model.js"
import { buildPlannerDetailQuery, buildPlannerListQuery } from "./query-builder.js"
import * as PlannerStore from "./store.js"
import { type IUpdatePlannerDTO } from "./type.js"

export async function getPlannerList(
  user: {
    accountId: string
    role: string
    companies: TCompanyMember[]
    isSupervisor: boolean
  },
  query: typeof PlannerModel.queriesPlanner.static
) {
  const page = query.page || 1
  const pageSize = query.pageSize || 6

  const conditions = buildPlannerListQuery(user, query)
  const match: Record<string, unknown> = { $and: conditions }
  const skip = (page - 1) * pageSize

  const { planners, totalCount } = await PlannerStore.getPlanners(match, skip, pageSize)

  const totalPages = Math.ceil(totalCount / pageSize)

  return {
    planners: planners.map(PlannerModel.toPlannerDto),
    totalCount,
    totalPages,
  }
}

export async function getPlannerDetail(
  user: { accountId: string; role: string; companies: TCompanyMember[]; isSupervisor: boolean },
  documentId: string
) {
  const query = buildPlannerDetailQuery(user, documentId)

  const planner = await PlannerStore.findOnePlanner(query)

  if (!planner) {
    return null
  }

  const mapPlanner = await mapPlannerForView(planner)

  if (!mapPlanner) {
    return null
  }

  const plannerData = Array.isArray(mapPlanner) ? mapPlanner[0] : mapPlanner
  return plannerData ? PlannerModel.toPlannerDto(plannerData) : null
}

export async function getEditablePlanner(
  user: { accountId: string; companies: TCompanyMember[]; role: string },
  documentId: string
) {
  const planner = await PlannerStore.findOnePlanner({ documentId })

  if (!planner) {
    return { success: false, message: "ไม่พบข้อมูลที่ร้องขอภายในระบบ", status: 404 } as const
  }

  const { allowed, reason } = canEditPlanner(
    { userId: user.accountId, role: user.role, companies: user.companies },
    planner
  )

  if (!allowed) {
    return { success: false, message: reason || "ไม่มีสิทธิ์แก้ไขแผนงานนี้", status: 403 } as const
  }

  return { success: true, status: 200, planner } as const
}

export async function updatePlannerByDocumentId(documentId: string, data: IUpdatePlannerDTO) {
  await PlannerStore.updatePlanner({ documentId }, { $set: buildPlannerUpdate(data) })
}

export async function updatePlanner(
  user: { accountId: string; companies: TCompanyMember[]; role: string },
  documentId: string,
  data: IUpdatePlannerDTO
) {
  const editable = await getEditablePlanner(user, documentId)

  if (!editable.success) {
    return editable
  }

  await updatePlannerByDocumentId(documentId, data)

  return { success: true, message: "แก้ไข planner สำเร็จ", status: 200 }
}

const GA_CANCELLATION_STATUSES = new Set<PlannerStatus>([
  STATUS.WAITING_GA_ESTIMATE,
  STATUS.WAITING_GA_ACTUAL_COST,
  STATUS.WAITING_JV_APPROVAL,
  STATUS.JV_APPROVED,
])
const GM_CANCELLATION_STATUSES = new Set<PlannerStatus>([
  STATUS.WAITING_JV_APPROVAL,
  STATUS.JV_APPROVED,
  STATUS.JV_REJECTED,
  STATUS.WAITING_EMP_SUMMARY,
  STATUS.WAITING_GA_ACTUAL_COST,
  STATUS.WAITING_CLAIM_ALLOWANCE,
])

export async function cancelPlanner(
  user: { accountId: string; companies: TCompanyMember[]; role: string },
  documentId: string,
  rawReason: string
) {
  const reason = rawReason.trim()
  if (!reason) {
    return { success: false, status: 400, message: "กรุณาระบุเหตุผลการยกเลิกแผนงาน" } as const
  }

  const plannerBefore = await PlannerStore.findOnePlanner({ documentId })
  if (!plannerBefore) {
    return { success: false, status: 404, message: "ไม่พบแผนงานที่ระบุ" } as const
  }

  const permission = canCancelPlanner(
    { userId: user.accountId, role: user.role, companies: user.companies },
    plannerBefore
  )
  if (!permission.allowed) {
    return { success: false, status: 403, message: "เฉพาะผู้สร้างแผนงานเท่านั้นที่สามารถยกเลิกได้" } as const
  }

  if (plannerBefore.status.includes(STATUS.CANCELLED)) {
    return {
      success: true,
      status: 200,
      message: "แผนงานถูกยกเลิกแล้ว",
      previousStatuses: plannerBefore.cancellation?.previousStatuses ?? [],
    } as const
  }

  // const claimedMonths = plannerBefore.participants.flatMap((participant) => participant.monthsClaimed ?? [])
  // if (claimedMonths.some((month) => month.status !== "CANCEL")) {
  //   return {
  //     success: false,
  //     status: 409,
  //     message: "กรุณายกเลิกคำขอเบิกเบี้ยเลี้ยงใน Digital Workflow ให้ครบก่อนยกเลิกแผนงาน",
  //   } as const
  // }

  const currentStatuses = plannerBefore.status.map((value) => String(value) as PlannerStatus)
  const nextStatuses = moveStatusForward(currentStatuses, PLANNER_ACTIONS.CANCEL, currentStatuses[0] ?? STATUS.DRAFT)
  const cancelledAt = new Date()
  const currentVersion = (plannerBefore as typeof plannerBefore & { __v?: number }).__v ?? 0
  const plannerAfter = await PlannerStore.cancelPlanner(
    documentId,
    user.accountId,
    currentVersion,
    currentStatuses,
    { reason, cancelledBy: user.accountId, cancelledAt, previousStatuses: currentStatuses },
    nextStatuses
  )

  if (!plannerAfter) {
    const latest = await PlannerStore.findOnePlanner({ documentId })
    if (latest?.status.includes(STATUS.CANCELLED)) {
      return {
        success: true,
        status: 200,
        message: "แผนงานถูกยกเลิกแล้ว",
        previousStatuses: latest.cancellation?.previousStatuses ?? [],
      } as const
    }
    return { success: false, status: 409, message: "สถานะแผนงานมีการเปลี่ยนแปลง กรุณาตรวจสอบและลองใหม่อีกครั้ง" } as const
  }

  const notifyGa = currentStatuses.some((status) => GA_CANCELLATION_STATUSES.has(status))
  const notifyGm = currentStatuses.some((status) => GM_CANCELLATION_STATUSES.has(status))

  try {
    await workflowEventDispatcher.dispatch({
      type: "PLANNER_CANCELLED",
      payload: {
        plannerBefore,
        plannerAfter,
      },
      meta: {
        actorAccountId: user.accountId,
        reason,
        notifyGa,
        notifyGm,
      },
    })
  } catch (error) {
    console.error("Failed to record planner cancelled workflow event:", error)
  }

  return {
    success: true,
    status: 200,
    message: "ยกเลิกแผนงานสำเร็จ",
    previousStatuses: currentStatuses,
  } as const
}
