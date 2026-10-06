import { recipientTargets } from "./recipient-targets.js"
import { notificationRulesConfig } from "./rules.js"
import {
  type NotificationContentVariant,
  type NotificationRuleDefinition,
  type RecipientKind,
  type RecipientTarget,
  type ResolvedNotification,
  type StatusGuard,
  type WorkflowEventPayload,
} from "./type.js"

export interface ResolvedRecipient {
  accountId: string
  kind: RecipientKind
}

/** The Recipient Kinds that mean "notified because the account holds that role". */
export type RecipientRole = Extract<RecipientKind, "GA" | "PLANNER" | "FINANCE">

export interface RecipientResolver {
  resolveAccountRecipients(accountIds: string[], kind: RecipientKind): Promise<ResolvedRecipient[]>
  /** Resolves every account holding `role`; each recipient's Recipient Kind is that role. */
  resolveRoleRecipients(role: RecipientRole): Promise<ResolvedRecipient[]>
  resolveSupervisorRecipients(subordinateEmployeeIds: string[]): Promise<ResolvedRecipient[]>
}

export async function evaluateRules(
  event: WorkflowEventPayload,
  recipients: RecipientResolver
): Promise<ResolvedNotification[]> {
  const definition = notificationRulesConfig.events[event.eventType]

  if (definition.mode === "audit_only") {
    return []
  }

  if (!matchesGuards(event, definition.guards)) {
    return []
  }

  const resolvedRecipients = await resolveTargets(event, definition.targets, recipients)

  return resolvedRecipients.map((recipient) => buildResolvedNotification(event, definition, recipient))
}

function matchesGuards(event: WorkflowEventPayload, guards?: StatusGuard[]) {
  if (!guards || guards.length === 0) {
    return true
  }

  return guards.some((guard) => matchesGuard(event, guard))
}

function matchesGuard(event: WorkflowEventPayload, guard: StatusGuard) {
  return (
    includesAll(event.fromStatuses, guard.fromStatusesAllOf) &&
    includesNone(event.fromStatuses, guard.fromStatusesNoneOf) &&
    includesAll(event.toStatuses, guard.toStatusesAllOf) &&
    includesNone(event.toStatuses, guard.toStatusesNoneOf)
  )
}

function includesAll(statuses: string[], required?: string[]) {
  return !required || required.every((status) => statuses.includes(status))
}

function includesNone(statuses: string[], blocked?: string[]) {
  return !blocked || blocked.every((status) => !statuses.includes(status))
}

async function resolveTargets(event: WorkflowEventPayload, targets: RecipientTarget[], recipients: RecipientResolver) {
  const groups = await Promise.all(targets.map((target) => recipientTargets[target].resolve(event, recipients)))
  return groups.flat()
}

function buildResolvedNotification(
  event: WorkflowEventPayload,
  definition: NotificationRuleDefinition,
  recipient: ResolvedRecipient
): ResolvedNotification {
  const content = selectContentVariant(event, definition.content, recipient)

  return {
    accountId: recipient.accountId,
    recipientKind: recipient.kind,
    eventType: event.eventType,
    templateKey: interpolate(content.templateKey, event, recipient),
    title: interpolate(content.title, event, recipient),
    body: interpolate(content.body, event, recipient),
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    data: {
      documentId: event.metadata.documentId,
      ...(event.metadata.jvTaxId ? { jvTaxId: event.metadata.jvTaxId } : {}),
      ...(event.metadata.resetJvTaxIds && event.metadata.resetJvTaxIds.length > 0
        ? { resetJvTaxIds: event.metadata.resetJvTaxIds }
        : {}),
      ...(event.metadata.transactionId ? { transactionId: event.metadata.transactionId } : {}),
      ...(event.metadata.pendingConfirmExpireAt
        ? { pendingConfirmExpireAt: event.metadata.pendingConfirmExpireAt }
        : {}),
      ...(event.metadata.cancellationReason ? { cancellationReason: event.metadata.cancellationReason } : {}),
    },
  }
}

function selectContentVariant(
  event: WorkflowEventPayload,
  contentVariants: NotificationContentVariant[],
  recipient: ResolvedRecipient
) {
  const matchingVariant = contentVariants.find((variant) => matchesContentVariant(event, variant, recipient))

  if (matchingVariant) {
    return matchingVariant
  }

  throw new Error(
    `Missing content variant for event recipient combination: ${recipient.kind} on ${contentVariants.length} variants`
  )
}

function matchesContentVariant(
  event: WorkflowEventPayload,
  variant: NotificationContentVariant,
  recipient: ResolvedRecipient
) {
  if (variant.when?.recipientKinds?.length && !variant.when.recipientKinds.includes(recipient.kind)) {
    return false
  }

  if (!variant.when?.metadata) {
    return true
  }

  return Object.entries(variant.when.metadata).every(([key, value]) => {
    const metadataKey = key as keyof WorkflowEventPayload["metadata"]
    return event.metadata[metadataKey] === value
  })
}

function interpolate(template: string, event: WorkflowEventPayload, recipient: ResolvedRecipient) {
  const values: Record<string, string> = {
    sourceName: event.sourceName,
    sourceId: event.sourceId,
    eventType: event.eventType,
    recipientKind: recipient.kind,
    recipientKindLower: recipient.kind.toLowerCase(),
  }

  for (const [key, value] of Object.entries(event.metadata)) {
    if (value === undefined || value === null) {
      continue
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values[key] = String(value)
    }
  }

  return template.replaceAll(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}
