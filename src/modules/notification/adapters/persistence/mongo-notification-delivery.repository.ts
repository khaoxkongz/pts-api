import { type AnyBulkWriteOperation } from "mongoose"

import { PlannerNotification, type TPlannerNotification } from "@/models/planner-notification.js"
import { WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import { type NotificationDocument } from "../../core/notification-dto.js"
import { type NotificationDelivery } from "../../core/ports/notification-delivery.port.js"

export const MongoNotificationDeliveryRepository: NotificationDelivery = {
  async lockPendingOutboxEvent(outboxId: string) {
    const outbox = await WorkflowEventOutbox.findOneAndUpdate(
      {
        _id: outboxId,
        status: {
          $in: ["PENDING", "FAILED"],
        },
      },
      {
        $set: {
          status: "PROCESSING",
        },
      },
      { new: true }
    ).lean()

    return outbox as { payload: unknown } | null
  },

  async updateOutboxStatusFailed(outboxId: string, error: unknown) {
    await WorkflowEventOutbox.updateOne(
      { _id: outboxId },
      {
        $set: {
          status: "FAILED",
          lastError: error instanceof Error ? error.message : String(error),
        },
        $inc: {
          attempts: 1,
        },
      }
    )
  },

  async updateOutboxStatusPublished(outboxId: string) {
    await WorkflowEventOutbox.updateOne(
      { _id: outboxId },
      {
        $set: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          lastError: "",
        },
        $inc: {
          attempts: 1,
        },
      }
    )
  },

  async bulkUpsertNotifications(operations: AnyBulkWriteOperation<TPlannerNotification>[]) {
    await PlannerNotification.bulkWrite(operations)
  },

  async findNotificationsByEventId(eventId: string, accountIds: string[]) {
    const notifications = await PlannerNotification.find({
      eventId,
      accountId: {
        $in: accountIds,
      },
    }).lean()

    return notifications as unknown as NotificationDocument[]
  },
}
