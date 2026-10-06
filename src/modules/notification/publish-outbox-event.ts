import { type StoredNotification, toNotificationDto } from "./dto.js"
import { evaluateRules, type RecipientResolver } from "./evaluate-rules.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

export interface NotificationDelivery {
  // null when the Outbox Event is missing, already published or being processed.
  lockOutboxEventAndGetWorkflowEvent(outboxId: string): Promise<WorkflowEventPayload | null>
  updateOutboxStatusFailed(outboxId: string, error: unknown): Promise<void>
  updateOutboxStatusPublished(outboxId: string): Promise<void>
  // One notification per (event, account, Recipient Kind), never overwritten. Returns each one
  // for resolvedNotifications, including ones that already existed, so a retry re-pushes them.
  saveNotifications(
    event: WorkflowEventPayload,
    resolvedNotifications: ResolvedNotification[]
  ): Promise<StoredNotification[]>
}

export interface PushHub {
  push(accountId: string, event: string, payload: unknown): void
}

export interface PublishOutboxEventDeps {
  delivery: NotificationDelivery
  recipients: RecipientResolver
  pushHub: PushHub
}

export function createOutboxEventPublisher(deps: PublishOutboxEventDeps) {
  return async function execute(outboxId: string): Promise<void> {
    const event = await deps.delivery.lockOutboxEventAndGetWorkflowEvent(outboxId)
    if (!event) {
      return
    }

    try {
      const resolvedNotifications = await evaluateRules(event, deps.recipients)
      const notifications = await deps.delivery.saveNotifications(event, resolvedNotifications)

      // A retried event re-pushes notifications that already existed, so a Live Push arrives at least once.
      for (const notification of notifications) {
        deps.pushHub.push(notification.accountId, "notification.created", toNotificationDto(notification))
      }

      await deps.delivery.updateOutboxStatusPublished(outboxId)
    } catch (error) {
      await deps.delivery.updateOutboxStatusFailed(outboxId, error)
      throw error
    }
  }
}
