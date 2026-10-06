import { PlannerNotification } from "@/models/planner-notification.js"

import { type StoredNotification } from "./dto.js"
import { type NotificationStore } from "./publish-outbox-event.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

function notificationKey(notification: { accountId: string; recipientKind: string }) {
  return `${notification.accountId}|${notification.recipientKind}`
}

export const MongoNotificationStore: NotificationStore = {
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
