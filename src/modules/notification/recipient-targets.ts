import type { RecipientResolver, RecipientRole, ResolvedRecipient } from "./evaluate-rules.js"

import {
  type RecipientKind,
  type RecipientTarget,
  type WorkflowEventMetadata,
  type WorkflowEventPayload,
} from "./type.js"

interface RecipientTargetEntry {
  // The Recipient Kinds this target can produce; rules-config validation checks content variants against them.
  kinds: readonly RecipientKind[]
  resolve(event: WorkflowEventPayload, recipients: RecipientResolver): Promise<ResolvedRecipient[]>
}

// Every account holding the role; each recipient's Recipient Kind is the role.
function roleTarget(role: RecipientRole): RecipientTargetEntry {
  return {
    kinds: [role],
    resolve: (_event, recipients) => recipients.resolveRoleRecipients(role),
  }
}

// The accounts the event names, each notified as `kind`.
function accountTarget(
  kind: RecipientKind,
  accountIdsOf: (metadata: WorkflowEventMetadata) => string[]
): RecipientTargetEntry {
  return {
    kinds: [kind],
    resolve: (event, recipients) => recipients.resolveAccountRecipients(accountIdsOf(event.metadata), kind),
  }
}

// An optional account id as a list of account ids.
function accountIdsFrom(accountId: string | undefined): string[] {
  return accountId ? [accountId] : []
}

const gaRole = roleTarget("GA")
const gmApprovers = accountTarget("GM_APPROVER", (metadata) => metadata.gmApproverAccountIds ?? [])
const creatorAndParticipants = accountTarget("EMPLOYEE", (metadata) =>
  [metadata.creatorAccountId, ...(metadata.participantAccountIds ?? [])].filter((accountId): accountId is string =>
    Boolean(accountId)
  )
)

// The creator and participants, plus GA and the GM Approvers when the event asks for them.
const cancellationAudience: RecipientTargetEntry = {
  kinds: [creatorAndParticipants, gaRole, gmApprovers].flatMap((target) => target.kinds),
  resolve: async (event, recipients) => {
    const groups = await Promise.all([
      creatorAndParticipants.resolve(event, recipients),
      event.metadata.notifyGa ? gaRole.resolve(event, recipients) : Promise.resolve([]),
      event.metadata.notifyGm ? gmApprovers.resolve(event, recipients) : Promise.resolve([]),
    ])

    // One recipient per Recipient Kind and account.
    const unique = new Map<string, ResolvedRecipient>()
    for (const recipient of groups.flat()) {
      unique.set(`${recipient.kind}:${recipient.accountId}`, recipient)
    }
    return [...unique.values()]
  },
}

// Every Recipient Target, described once. Rule evaluation resolves targets from this table and the rules config
// validates against it, so this module must not import the rules config (it validates itself when it loads).
export const recipientTargets: Record<RecipientTarget, RecipientTargetEntry> = {
  "ROLE:GA": gaRole,
  "ROLE:PLANNER": roleTarget("PLANNER"),
  "ROLE:FINANCE": roleTarget("FINANCE"),
  SUPERVISOR: {
    kinds: ["SUPERVISOR"],
    resolve: (event, recipients) => {
      const creatorIds = event.metadata.creatorEmployeeIds ?? []
      const participantIds = event.metadata.participantEmployeeIds ?? []
      return recipients.resolveSupervisorRecipients([...new Set([...creatorIds, ...participantIds])])
    },
  },
  CREATOR: accountTarget("EMPLOYEE", (metadata) => accountIdsFrom(metadata.creatorAccountId)),
  PLANNER_MEMBERS: accountTarget("EMPLOYEE", (metadata) => metadata.participantAccountIds ?? []),
  GM_APPROVERS: gmApprovers,
  RESET_APPROVERS: accountTarget("GM_APPROVER", (metadata) => metadata.resetApproverAccountIds ?? []),
  AFFECTED_EMPLOYEE: accountTarget("EMPLOYEE", (metadata) => accountIdsFrom(metadata.affectedParticipantAccountId)),
  CANCELLATION_AUDIENCE: cancellationAudience,
}
