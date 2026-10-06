import { notificationRulesConfig } from "./rules.js"
import {
  type NotificationContentVariant,
  type NotificationRuleDefinition,
  type NotificationRulesConfig,
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

export type RecipientRole = "GA" | "PLANNER" | "FINANCE"

export interface RecipientResolver {
  resolveAccountRecipients(accountIds: string[], kind: RecipientKind): Promise<ResolvedRecipient[]>
  resolveRoleRecipients(role: RecipientRole, kind: RecipientKind): Promise<ResolvedRecipient[]>
  resolveSupervisorRecipients(subordinateEmployeeIds: string[]): Promise<ResolvedRecipient[]>
}

export class NotificationRulesEngine {
  constructor(
    private readonly recipientResolver: RecipientResolver,
    private readonly config: NotificationRulesConfig = notificationRulesConfig
  ) {}

  public async evaluate(event: WorkflowEventPayload): Promise<ResolvedNotification[]> {
    const definition = this.config.events[event.eventType]

    if (definition.mode === "audit_only") {
      return []
    }

    if (!NotificationRulesEngine.matchesGuards(event, definition.guards)) {
      return []
    }

    const recipients = await this.resolveTargets(event, definition.targets)

    return recipients.map((recipient) =>
      NotificationRulesEngine.buildResolvedNotification(event, definition, recipient)
    )
  }

  private static matchesGuards(event: WorkflowEventPayload, guards?: StatusGuard[]) {
    if (!guards || guards.length === 0) {
      return true
    }

    return guards.some((guard) => NotificationRulesEngine.matchesGuard(event, guard))
  }

  private static matchesGuard(event: WorkflowEventPayload, guard: StatusGuard) {
    return (
      NotificationRulesEngine.includesAll(event.fromStatuses, guard.fromStatusesAllOf) &&
      NotificationRulesEngine.includesNone(event.fromStatuses, guard.fromStatusesNoneOf) &&
      NotificationRulesEngine.includesAll(event.toStatuses, guard.toStatusesAllOf) &&
      NotificationRulesEngine.includesNone(event.toStatuses, guard.toStatusesNoneOf)
    )
  }

  private static includesAll(statuses: string[], required?: string[]) {
    return !required || required.every((status) => statuses.includes(status))
  }

  private static includesNone(statuses: string[], blocked?: string[]) {
    return !blocked || blocked.every((status) => !statuses.includes(status))
  }

  private async resolveTargets(event: WorkflowEventPayload, targets: RecipientTarget[]) {
    const groups = await Promise.all(targets.map((target) => this.resolveTarget(event, target)))
    return groups.flat()
  }

  private async resolveTarget(event: WorkflowEventPayload, target: RecipientTarget): Promise<ResolvedRecipient[]> {
    switch (target) {
      case "ROLE:GA": {
        return await this.recipientResolver.resolveRoleRecipients("GA", "GA")
      }
      case "ROLE:PLANNER": {
        return await this.recipientResolver.resolveRoleRecipients("PLANNER", "PLANNER")
      }
      case "ROLE:FINANCE": {
        return await this.recipientResolver.resolveRoleRecipients("FINANCE", "FINANCE")
      }
      case "SUPERVISOR": {
        const creatorIds = event.metadata.creatorEmployeeIds ?? []
        const participantIds = event.metadata.participantEmployeeIds ?? []
        const allEmployeeIds = [...new Set([...creatorIds, ...participantIds])]
        return await this.recipientResolver.resolveSupervisorRecipients(allEmployeeIds)
      }
      case "CREATOR": {
        return await this.recipientResolver.resolveAccountRecipients(
          event.metadata.creatorAccountId ? [event.metadata.creatorAccountId] : [],
          "EMPLOYEE"
        )
      }
      case "GM_APPROVERS": {
        return await this.recipientResolver.resolveAccountRecipients(
          event.metadata.gmApproverAccountIds ?? [],
          "GM_APPROVER"
        )
      }
      case "RESET_APPROVERS": {
        return await this.recipientResolver.resolveAccountRecipients(
          event.metadata.resetApproverAccountIds ?? [],
          "GM_APPROVER"
        )
      }
      case "PLANNER_MEMBERS": {
        return await this.recipientResolver.resolveAccountRecipients(
          event.metadata.participantAccountIds ?? [],
          "EMPLOYEE"
        )
      }
      case "AFFECTED_EMPLOYEE": {
        return await this.recipientResolver.resolveAccountRecipients(
          event.metadata.affectedParticipantAccountId ? [event.metadata.affectedParticipantAccountId] : [],
          "EMPLOYEE"
        )
      }
      case "CANCELLATION_AUDIENCE": {
        const groups = await Promise.all([
          this.recipientResolver.resolveAccountRecipients(
            [event.metadata.creatorAccountId, ...(event.metadata.participantAccountIds ?? [])].filter(
              (accountId): accountId is string => Boolean(accountId)
            ),
            "EMPLOYEE"
          ),
          event.metadata.notifyGa ? this.recipientResolver.resolveRoleRecipients("GA", "GA") : Promise.resolve([]),
          event.metadata.notifyGm
            ? this.recipientResolver.resolveAccountRecipients(event.metadata.gmApproverAccountIds ?? [], "GM_APPROVER")
            : Promise.resolve([]),
        ])

        const unique = new Map<string, ResolvedRecipient>()
        for (const recipient of groups.flat()) {
          unique.set(`${recipient.kind}:${recipient.accountId}`, recipient)
        }
        return [...unique.values()]
      }
      default: {
        const exhaustiveTarget: never = target
        throw new Error(`Unsupported recipient target: ${String(exhaustiveTarget)}`)
      }
    }
  }

  private static buildResolvedNotification(
    event: WorkflowEventPayload,
    definition: NotificationRuleDefinition,
    recipient: ResolvedRecipient
  ): ResolvedNotification {
    const content = NotificationRulesEngine.selectContentVariant(event, definition.content, recipient)

    return {
      accountId: recipient.accountId,
      recipientKind: recipient.kind,
      eventType: event.eventType,
      templateKey: NotificationRulesEngine.interpolate(content.templateKey, event, recipient),
      title: NotificationRulesEngine.interpolate(content.title, event, recipient),
      body: NotificationRulesEngine.interpolate(content.body, event, recipient),
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

  private static selectContentVariant(
    event: WorkflowEventPayload,
    contentVariants: NotificationContentVariant[],
    recipient: ResolvedRecipient
  ) {
    const matchingVariant = contentVariants.find((variant) =>
      NotificationRulesEngine.matchesContentVariant(event, variant, recipient)
    )

    if (matchingVariant) {
      return matchingVariant
    }

    throw new Error(
      `Missing content variant for event recipient combination: ${recipient.kind} on ${contentVariants.length} variants`
    )
  }

  private static matchesContentVariant(
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

  private static interpolate(template: string, event: WorkflowEventPayload, recipient: ResolvedRecipient) {
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
}
