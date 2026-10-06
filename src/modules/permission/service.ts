import { type TPlanner } from "@/models/planner.js"
import { STATUS } from "@/utils/status/status.js"

import { type PermissionCheckResult, type UserContext } from "./type.js"

export function canViewPlanner(
  user: UserContext,
  planner: TPlanner,
  subordinateIds: string[] = []
): PermissionCheckResult {
  if (planner.createdBy === user.userId) {
    return { allowed: true }
  }

  const isParticipant = planner.participants.some((p) => p.accountId === user.userId)
  const isDraft = planner.status.includes(STATUS.DRAFT)

  if (isParticipant && !isDraft) {
    return { allowed: true }
  }

  if (user.isSupervisor && !isDraft) {
    if (planner.createdByEmployeeId && planner.createdByEmployeeId.some((id) => subordinateIds.includes(id))) {
      return { allowed: true }
    }

    const hasSubordinateParticipant = planner.participants.some(
      (p) => p.employeeId && subordinateIds.some((id) => p.employeeId?.includes(id))
    )
    if (hasSubordinateParticipant) {
      return { allowed: true }
    }
  }

  if ((user.role === "GA" || user.role === "GM") && !isDraft) {
    return { allowed: true }
  }

  return { allowed: false, reason: "Access denied" }
}

export function canEditPlanner(user: UserContext, planner: TPlanner): PermissionCheckResult {
  if (planner.createdBy === user.userId && planner.status.includes(STATUS.DRAFT)) {
    return { allowed: true }
  }

  return { allowed: false, reason: "Cannot edit this planner" }
}

export function canCancelPlanner(user: UserContext, planner: TPlanner): PermissionCheckResult {
  if (planner.createdBy === user.userId) {
    return { allowed: true }
  }

  return { allowed: false, reason: "Only the planner creator can cancel this planner" }
}

export function canApproveJv(user: UserContext, jv: TPlanner["jvs"][number]): PermissionCheckResult {
  if (jv.status !== STATUS.WAITING_JV_APPROVAL) {
    return { allowed: false, reason: "JV is not in waiting approval status" }
  }

  const isApprover = jv.approversList.some((a) => a.accountId === user.userId)
  if (!isApprover) {
    return { allowed: false, reason: "User is not an authorized approver" }
  }

  return { allowed: true }
}
