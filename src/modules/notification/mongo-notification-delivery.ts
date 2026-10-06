import { PlannerNotification } from "@/models/planner-notification.js"
import { WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import { type StoredNotification } from "./dto.js"
import { type NotificationDelivery } from "./publish-outbox-event.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

function notificationKey(notification: { accountId: string; recipientKind: string }) {
  return `${notification.accountId}|${notification.recipientKind}`
}

export const MongoNotificationDeliveryRepository: NotificationDelivery = {
  async lockOutboxEventAndGetWorkflowEvent(outboxId: string) {
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

    // The payload is stored as Mixed; it is always written from a WorkflowEventPayload by the dispatcher.
    return outbox ? (outbox.payload as WorkflowEventPayload) : null
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

  async saveNotifications(event: WorkflowEventPayload, resolvedNotifications: ResolvedNotification[]) {
    if (resolvedNotifications.length === 0) {
      return []
    }

    // $setOnInsert keeps the unique (eventId, accountId, recipientKind) notification as first stored.
    await PlannerNotification.bulkWrite(
      resolvedNotifications.map((notification) => ({
        updateOne: {
          filter: {
            eventId: event.eventId,
            accountId: notification.accountId,
            recipientKind: notification.recipientKind,
          },
          update: {
            $setOnInsert: {
              eventId: event.eventId,
              eventType: event.eventType,
              accountId: notification.accountId,
              recipientKind: notification.recipientKind,
              templateKey: notification.templateKey,
              title: notification.title,
              body: notification.body,
              sourceType: notification.sourceType,
              sourceId: notification.sourceId,
              sourceName: notification.sourceName,
              data: notification.data,
              readAt: null,
            },
          },
          upsert: true,
        },
      }))
    )

    const wanted = new Set(resolvedNotifications.map(notificationKey))
    const stored = await PlannerNotification.find({
      eventId: event.eventId,
      accountId: {
        $in: [...new Set(resolvedNotifications.map((notification) => notification.accountId))],
      },
    }).lean()

    return stored.filter((notification) => wanted.has(notificationKey(notification))) as StoredNotification[]
  },
}
