import { type RecipientKind } from "../types.js"

export interface ResolvedRecipient {
  accountId: string
  kind: RecipientKind
}

export type RecipientRole = "GA" | "PLANNER" | "FINANCE"

export interface RecipientResolver {
  resolveAccountRecipients(accountIds: string[], kind: RecipientKind): Promise<ResolvedRecipient[]>
  resolveRoleRecipients(role: RecipientRole, kind: RecipientKind): Promise<ResolvedRecipient[]>
  resolveSupervisorRecipients(subordinateEmployeeIds: string[]): Promise<ResolvedRecipient[]>
}
