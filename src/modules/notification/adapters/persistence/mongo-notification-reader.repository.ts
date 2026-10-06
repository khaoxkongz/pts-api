import { PlannerNotification } from "@/models/planner-notification.js"

import { type NotificationDocument } from "../../core/notification-dto.js"
import { type NotificationReader } from "../../core/ports/notification-reader.port.js"

export const MongoNotificationReaderRepository: NotificationReader = {
  async findNotifications(accountId: string, skip: number, limit: number) {
    const notifications = await PlannerNotification.find(
      { accountId },
      {},
      { sort: { createdAt: -1 }, skip, limit, lean: true }
    )
    return notifications as unknown as NotificationDocument[]
  },

  async countNotifications(accountId: string) {
    return await PlannerNotification.countDocuments({ accountId })
  },

  async countUnreadNotifications(accountId: string) {
    return await PlannerNotification.countDocuments({ accountId, readAt: null })
  },
}
