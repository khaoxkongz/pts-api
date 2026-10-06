import { type AnyBulkWriteOperation } from "mongoose"

import { type TPlannerNotification } from "@/models/planner-notification.js"

import { type NotificationDocument } from "../notification-dto.js"

export interface NotificationDelivery {
  lockPendingOutboxEvent(outboxId: string): Promise<{ payload: unknown } | null>
  updateOutboxStatusFailed(outboxId: string, error: unknown): Promise<void>
  updateOutboxStatusPublished(outboxId: string): Promise<void>
  bulkUpsertNotifications(operations: AnyBulkWriteOperation<TPlannerNotification>[]): Promise<void>
  findNotificationsByEventId(eventId: string, accountIds: string[]): Promise<NotificationDocument[]>
}
