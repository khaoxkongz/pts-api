import { type QueryFilter } from "mongoose"

import { type TPlanner } from "@/models/planner.js"
import { type TUser } from "@/models/user.js"

import { type RbacUserContext, type TQueryFilters, type TRole } from "./type.js"
import { getSubordinateIds } from "./utils.js"

const ADMIN_ROLES = ["GA", "PLANNER", "FINANCE", "SUPERADMIN"] as const

export const ALLOWED_VIEW_AS: Record<TRole, TRole[]> = {
  SUPERADMIN: ["SUPERADMIN", "GM", "GA", "PLANNER", "FINANCE", "EMPLOYEE"],
  SUPERVISOR: ["SUPERVISOR", "EMPLOYEE"],
  GM: ["GM", "EMPLOYEE"],
  GA: ["GA", "EMPLOYEE"],
  PLANNER: ["PLANNER", "EMPLOYEE"],
  FINANCE: ["FINANCE", "EMPLOYEE"],
  EMPLOYEE: ["EMPLOYEE"],
}

export function applyJvPermission(query: TQueryFilters, user: TUser, effectiveRole: TRole): { allowed: boolean } {
  if (ADMIN_ROLES.includes(effectiveRole as (typeof ADMIN_ROLES)[number])) {
    return { allowed: true }
  }

  if (!query.JV || query.JV === "") {
    query.JV = "ALL"
    return { allowed: true }
  }

  if (query.role === "GM") {
    if (user.gmCompany.includes(query.JV)) {
      return { allowed: true }
    }

    return { allowed: false }
  }

  if (!user.companies.some((company) => company.companyName === query.JV)) {
    return { allowed: false }
  }

  return { allowed: true }
}

export function validateViewAsRole(
  queryRole: TRole,
  userRole: TRole,
  isSupervisor: boolean
): { allowed: boolean; effectiveRole: TRole } {
  if (!queryRole) {
    return { allowed: true, effectiveRole: userRole }
  }

  const allowed = ALLOWED_VIEW_AS[userRole] ?? [userRole]

  if (!allowed.includes(queryRole) && !isSupervisor) {
    return { allowed: false, effectiveRole: userRole }
  }

  return { allowed: true, effectiveRole: queryRole }
}

function buildEmployeeFilter(employeeId: string[]): QueryFilter<TPlanner> | null {
  if (!employeeId || employeeId.length === 0) {
    return null
  }

  return {
    $or: [{ createdByEmployeeId: { $in: employeeId } }, { "participants.employeeId": { $in: employeeId } }],
  }
}

async function buildSupervisorFilter(employeeId: string[]): Promise<QueryFilter<TPlanner> | null> {
  if (!employeeId || employeeId.length === 0) {
    return null
  }

  let subordinateIds: string[] = []
  for (const id of employeeId) {
    const ids = await getSubordinateIds(id)
    subordinateIds.push(...ids)
  }

  if (subordinateIds.length === 0) {
    return null
  }

  return {
    $or: [{ createdByEmployeeId: { $in: subordinateIds } }, { "participants.employeeId": { $in: subordinateIds } }],
  }
}

export async function buildRbacMatch(user: RbacUserContext): Promise<QueryFilter<TPlanner>> {
  const conditions: QueryFilter<TPlanner>[] = []

  if (ADMIN_ROLES.includes(user.effectiveRole as (typeof ADMIN_ROLES)[number])) {
    return {}
  }

  const employeeFilter = buildEmployeeFilter(user.employeeId)
  if (employeeFilter) {
    conditions.push(employeeFilter)
  }

  if (user.effectiveRole !== "EMPLOYEE" && user.isSupervisor) {
    const supervisorFilter = await buildSupervisorFilter(user.employeeId)

    if (supervisorFilter) {
      conditions.push(supervisorFilter)
    }
  }

  if (conditions.length === 0) {
    return {}
  }

  return conditions.length === 1 ? (conditions?.[0] ?? {}) : { $or: conditions.flatMap((c) => c.$or ?? [c]) }
}
