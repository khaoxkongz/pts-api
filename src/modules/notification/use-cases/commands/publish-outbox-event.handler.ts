import { toNotificationDto } from "../../core/notification-dto.js"
import { type NotificationDelivery } from "../../core/ports/notification-delivery.port.js"
import { type PushHub } from "../../core/ports/push-hub.port.js"
import { type NotificationRulesEngine } from "../../core/rules/notification-rules.engine.js"
import { type WorkflowEventPayload } from "../../core/types.js"

export interface PublishOutboxEventDeps {
  notificationDelivery: NotificationDelivery
  rulesEngine: NotificationRulesEngine
  pushHub: PushHub
}

export function publishOutboxEventCommand(deps: PublishOutboxEventDeps) {
  return async function execute(outboxId: string): Promise<void> {
    const outbox = await deps.notificationDelivery.lockPendingOutboxEvent(outboxId)
    if (!outbox) {
      return
    }

    const event = outbox.payload as WorkflowEventPayload

    try {
      const resolvedNotifications = await deps.rulesEngine.evaluate(event)

      if (resolvedNotifications.length > 0) {
        await deps.notificationDelivery.bulkUpsertNotifications(
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

        const notifications = await deps.notificationDelivery.findNotificationsByEventId(
          event.eventId,
          resolvedNotifications.map((notification) => notification.accountId)
        )

        for (const notification of notifications) {
          deps.pushHub.push(notification.accountId, "notification.created", toNotificationDto(notification))
        }
      }

      await deps.notificationDelivery.updateOutboxStatusPublished(outboxId)
    } catch (error) {
      await deps.notificationDelivery.updateOutboxStatusFailed(outboxId, error)
      throw error
    }
  }
}
