import type { RecipientResolver, ResolvedRecipient } from "./evaluate-rules.js"

import { type RecipientKind, type RecipientTarget, type WorkflowEventPayload } from "./type.js"

export interface RecipientTargetEntry {
  /** The Recipient Kinds this target can produce; rules-config validation checks content variants against them. */
  kinds: readonly RecipientKind[]
  resolve(event: WorkflowEventPayload, recipients: RecipientResolver): Promise<ResolvedRecipient[]>
}

/**
 * Every Recipient Target, described once. Rule evaluation resolves targets from this table and the rules config
 * validates against it, so this module must not import the rules config (it validates itself when it loads).
 */
export const recipientTargets: Record<RecipientTarget, RecipientTargetEntry> = {
  "ROLE:GA": {
    kinds: ["GA"],
    resolve: (_event, recipients) => recipients.resolveRoleRecipients("GA"),
  },
  "ROLE:PLANNER": {
    kinds: ["PLANNER"],
    resolve: (_event, recipients) => recipients.resolveRoleRecipients("PLANNER"),
  },
  "ROLE:FINANCE": {
    kinds: ["FINANCE"],
    resolve: (_event, recipients) => recipients.resolveRoleRecipients("FINANCE"),
  },
  SUPERVISOR: {
    kinds: ["SUPERVISOR"],
    resolve: (event, recipients) => {
      const creatorIds = event.metadata.creatorEmployeeIds ?? []
      const participantIds = event.metadata.participantEmployeeIds ?? []
      return recipients.resolveSupervisorRecipients([...new Set([...creatorIds, ...participantIds])])
    },
  },
  CREATOR: {
    kinds: ["EMPLOYEE"],
    resolve: (event, recipients) =>
      recipients.resolveAccountRecipients(
        event.metadata.creatorAccountId ? [event.metadata.creatorAccountId] : [],
        "EMPLOYEE"
      ),
  },
  PLANNER_MEMBERS: {
    kinds: ["EMPLOYEE"],
    resolve: (event, recipients) =>
      recipients.resolveAccountRecipients(event.metadata.participantAccountIds ?? [], "EMPLOYEE"),
  },
  GM_APPROVERS: {
    kinds: ["GM_APPROVER"],
    resolve: (event, recipients) =>
      recipients.resolveAccountRecipients(event.metadata.gmApproverAccountIds ?? [], "GM_APPROVER"),
  },
  RESET_APPROVERS: {
    kinds: ["GM_APPROVER"],
    resolve: (event, recipients) =>
      recipients.resolveAccountRecipients(event.metadata.resetApproverAccountIds ?? [], "GM_APPROVER"),
  },
  AFFECTED_EMPLOYEE: {
    kinds: ["EMPLOYEE"],
    resolve: (event, recipients) =>
      recipients.resolveAccountRecipients(
        event.metadata.affectedParticipantAccountId ? [event.metadata.affectedParticipantAccountId] : [],
        "EMPLOYEE"
      ),
  },
  CANCELLATION_AUDIENCE: {
    kinds: ["EMPLOYEE", "GA", "GM_APPROVER"],
    resolve: async (event, recipients) => {
      const groups = await Promise.all([
        recipients.resolveAccountRecipients(
          [event.metadata.creatorAccountId, ...(event.metadata.participantAccountIds ?? [])].filter(
            (accountId): accountId is string => Boolean(accountId)
          ),
          "EMPLOYEE"
        ),
        event.metadata.notifyGa ? recipients.resolveRoleRecipients("GA") : Promise.resolve([]),
        event.metadata.notifyGm
          ? recipients.resolveAccountRecipients(event.metadata.gmApproverAccountIds ?? [], "GM_APPROVER")
          : Promise.resolve([]),
      ])

      // One recipient per Recipient Kind and account.
      const unique = new Map<string, ResolvedRecipient>()
      for (const recipient of groups.flat()) {
        unique.set(`${recipient.kind}:${recipient.accountId}`, recipient)
      }
      return [...unique.values()]
    },
  },
}
