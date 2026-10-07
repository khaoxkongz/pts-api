import { type AppPush } from "./app-push.js"
import { type StoredNotification, toNotificationDto } from "./dto.js"
import { evaluateRules, type RecipientResolver } from "./evaluate-rules.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

// Lock and status of an Outbox Event. Create isn't here: it is a plain function in the Mongo outbox file,
// called only by the dispatcher (ADR-0003).
export interface OutboxEvents {
  // Takes the Outbox Event for one publish, with a lease, and counts the attempt, so a publish that dies
  // still counts towards the cap. null when it is missing, already published, or being processed by
  // another attempt whose lease has not run out.
  lock(outboxId: string): Promise<WorkflowEventPayload | null>
  markPublished(outboxId: string): Promise<void>
  markFailed(outboxId: string, error: unknown): Promise<void>
  // Ids of Outbox Events that lock would take and whose attempts are below the cap, oldest first.
  // Lock doesn't check the cap, so an explicit publish-by-id can still force an event that reached it.
  findDue(options: FindDueOptions): Promise<string[]>
}

export interface FindDueOptions {
  maxAttempts: number
  limit: number
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
  appPush: AppPush
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

      // Send never rejects, so a failed App Push can't fail the Outbox Event; notifications already pushed are
      // skipped, so a retried event sends each App Push at most once (ADR-0004).
      await deps.appPush.send(notifications)

      await deps.outbox.markPublished(outboxId)
    } catch (error) {
      await deps.outbox.markFailed(outboxId, error)
      throw error
    }
  }
}
