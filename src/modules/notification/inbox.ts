import { PlannerNotification } from "@/models/planner-notification.js"

import { toNotificationDto, type StoredNotification } from "./dto.js"

export const Inbox = {
  async listPage(accountId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(page, 1)
    const safePageSize = Math.max(pageSize, 1)

    const [notifications, totalCount] = await Promise.all([
      PlannerNotification.find(
        { accountId },
        {},
        { sort: { createdAt: -1 }, skip: (safePage - 1) * safePageSize, limit: safePageSize }
      ).lean(),
      PlannerNotification.countDocuments({ accountId }),
    ])

    return {
      totalCount,
      totalPages: Math.ceil(totalCount / safePageSize),
      notifications: (notifications as StoredNotification[]).map((notification) => toNotificationDto(notification)),
    }
  },

  async countUnread(accountId: string) {
    return await PlannerNotification.countDocuments({ accountId, readAt: null })
  },

  async markRead(accountId: string, notificationId: string) {
    const notification = await PlannerNotification.findOneAndUpdate(
      { _id: notificationId, accountId, readAt: null },
      { $set: { readAt: new Date() } },
      { new: true }
    ).lean()

    return notification ? toNotificationDto(notification as StoredNotification) : null
  },

  async markAllRead(accountId: string) {
    const result = await PlannerNotification.updateMany({ accountId, readAt: null }, { $set: { readAt: new Date() } })

    return result.modifiedCount
  },
}
