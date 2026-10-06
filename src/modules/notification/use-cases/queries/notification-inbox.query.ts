import { toNotificationDto } from "../../core/notification-dto.js"
import { type NotificationReader } from "../../core/ports/notification-reader.port.js"

export interface NotificationInboxDeps {
  notificationReader: NotificationReader
}

export function notificationInboxQuery(deps: NotificationInboxDeps) {
  return async function execute(accountId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(page, 1)
    const safePageSize = Math.max(pageSize, 1)
    const skip = (safePage - 1) * safePageSize

    const [notifications, totalCount] = await Promise.all([
      deps.notificationReader.findNotifications(accountId, skip, safePageSize),
      deps.notificationReader.countNotifications(accountId),
    ])

    return {
      totalCount,
      totalPages: Math.ceil(totalCount / safePageSize),
      notifications: notifications.map((n) => toNotificationDto(n)),
    }
  }
}
