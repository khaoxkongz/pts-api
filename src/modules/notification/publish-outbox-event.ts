import { type StoredNotification, toNotificationDto } from "./dto.js"
import { evaluateRules, type RecipientResolver } from "./evaluate-rules.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

// Lock and status of an Outbox Event. Create isn't here: it is a plain function in the Mongo outbox file,
// called only by the dispatcher (ADR-0003).
export interface OutboxEvents {
  // null when the Outbox Event is missing, already published or being processed.
  lock(outboxId: string): Promise<WorkflowEventPayload | null>
  markPublished(outboxId: string): Promise<void>
  markFailed(outboxId: string, error: unknown): Promise<void>
}

export interface NotificationStore {
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
  outbox: OutboxEvents
  notifications: NotificationStore
  recipients: RecipientResolver
  pushHub: PushHub
}

export function createOutboxEventPublisher(deps: PublishOutboxEventDeps) {
  return async function execute(outboxId: string): Promise<void> {
    const event = await deps.outbox.lock(outboxId)
    if (!event) {
      return
    }

    try {
      const resolvedNotifications = await evaluateRules(event, deps.recipients)
      const notifications = await deps.notifications.saveNotifications(event, resolvedNotifications)

      // A retried event re-pushes notifications that already existed, so a Live Push arrives at least once.
      for (const notification of notifications) {
        deps.pushHub.push(notification.accountId, "notification.created", toNotificationDto(notification))
      }

      await deps.outbox.markPublished(outboxId)
    } catch (error) {
      await deps.outbox.markFailed(outboxId, error)
      throw error
    }
  }
}
