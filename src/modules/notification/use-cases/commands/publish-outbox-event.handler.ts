import { toNotificationDto } from "../../core/notification-dto.js"
import { type NotificationDelivery } from "../../core/ports/notification-delivery.port.js"
import { type PushHub } from "../../core/ports/push-hub.port.js"
import { type NotificationRulesEngine } from "../../core/rules/notification-rules.engine.js"

export interface PublishOutboxEventDeps {
  notificationDelivery: NotificationDelivery
  rulesEngine: NotificationRulesEngine
  pushHub: PushHub
}

export function publishOutboxEventCommand(deps: PublishOutboxEventDeps) {
  return async function execute(outboxId: string): Promise<void> {
    const event = await deps.notificationDelivery.lockPendingOutboxEvent(outboxId)
    if (!event) {
      return
    }

    try {
      const resolvedNotifications = await deps.rulesEngine.evaluate(event)
      const notifications = await deps.notificationDelivery.saveNotifications(event, resolvedNotifications)

      // A retried event re-pushes notifications that already existed, so a Live Push arrives at least once.
      for (const notification of notifications) {
        deps.pushHub.push(notification.accountId, "notification.created", toNotificationDto(notification))
      }

      await deps.notificationDelivery.updateOutboxStatusPublished(outboxId)
    } catch (error) {
      await deps.notificationDelivery.updateOutboxStatusFailed(outboxId, error)
      throw error
    }
  }
}
