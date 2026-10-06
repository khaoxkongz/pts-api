import { type TCompanyMember } from "@/models/user.js"

export type UserRole = "EMPLOYEE" | "GA" | "GM" | "SUPERADMIN" | "FINANCE" | "PLANNER"

export interface UserContext {
  userId: string
  role: string
  companies?: TCompanyMember[]
  isSupervisor?: boolean
}

export type PermissionAction = "VIEW" | "EDIT" | "APPROVE" | "REJECT"

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}
