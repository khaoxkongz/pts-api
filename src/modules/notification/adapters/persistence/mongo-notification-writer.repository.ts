import { PlannerNotification } from "@/models/planner-notification.js"

import { type NotificationDocument } from "../../core/notification-dto.js"
import { type NotificationWriter } from "../../core/ports/notification-writer.port.js"

export const MongoNotificationWriterRepository: NotificationWriter = {
  async markNotificationAsRead(accountId: string, notificationId: string) {
    const notification = await PlannerNotification.findOneAndUpdate(
      {
        _id: notificationId,
        accountId,
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
        },
      },
      { new: true }
    ).lean()

    return notification as unknown as NotificationDocument | null
  },

  async markAllNotificationsAsRead(accountId: string) {
    const result = await PlannerNotification.updateMany(
      {
        accountId,
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
        },
      }
    )

    return result.modifiedCount
  },
}
