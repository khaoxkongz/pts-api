import { Supervisor, User } from "@/models/user.js"

import { type RecipientResolver, type ResolvedRecipient } from "../../core/ports/recipient-resolver.port.js"
import { type RecipientKind } from "../../core/types.js"

export const MongoRecipientResolverRepository: RecipientResolver = {
  async resolveAccountRecipients(accountIds: string[], kind: RecipientKind): Promise<ResolvedRecipient[]> {
    const uniqueAccountIds = [...new Set(accountIds.filter(Boolean))]

    if (uniqueAccountIds.length === 0) {
      return []
    }

    const users = await User.find({ accountId: { $in: uniqueAccountIds } })
      .select("accountId")
      .lean()

    return users.map((user) => ({ accountId: user.accountId, kind }))
  },

  async resolveRoleRecipients(role: "GA" | "PLANNER" | "FINANCE", kind: RecipientKind): Promise<ResolvedRecipient[]> {
    const users = await User.find({ role }).select("accountId").lean()

    return users.map((user) => ({
      accountId: user.accountId,
      kind,
    }))
  },

  async resolveSupervisorRecipients(subordinateEmployeeIds: string[]): Promise<ResolvedRecipient[]> {
    if (subordinateEmployeeIds.length === 0) {
      return []
    }

    const supervisorMappings = await Supervisor.find({
      subordinateEmployeeIds: { $in: subordinateEmployeeIds },
    }).lean()

    const supervisorEmployeeIds = [...new Set(supervisorMappings.map((mapping) => mapping.supervisorEmployeeId))]

    if (supervisorEmployeeIds.length === 0) {
      return []
    }

    const supervisors = await User.find({ "companies.employeeId": { $in: supervisorEmployeeIds } })
      .select("accountId")
      .lean()

    return supervisors.map((user) => ({ accountId: user.accountId, kind: "SUPERVISOR" as const }))
  },
}
