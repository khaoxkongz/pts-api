import { type StoredNotification } from "../notification-dto.js"
import { type ResolvedNotification } from "../rules/types.js"
import { type WorkflowEventPayload } from "../types.js"

export interface NotificationDelivery {
  /**
   * Locks a pending or failed Outbox Event for processing and returns its Workflow Event,
   * or `null` when the event is already published, being processed, or missing.
   */
  lockPendingOutboxEvent(outboxId: string): Promise<WorkflowEventPayload | null>
  updateOutboxStatusFailed(outboxId: string, error: unknown): Promise<void>
  updateOutboxStatusPublished(outboxId: string): Promise<void>
  /**
   * Keeps one notification per (event, account, recipient kind): inserts on first sight and never overwrites.
   * Returns each stored notification for `resolvedNotifications` once, including ones that already existed.
   */
  saveNotifications(
    event: WorkflowEventPayload,
    resolvedNotifications: ResolvedNotification[]
  ): Promise<StoredNotification[]>
}
