import { type StoredNotification } from "../notification-dto.js"
import { type ResolvedNotification } from "../rules/types.js"
import { type WorkflowEventPayload } from "../types.js"

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
