import { type NotificationReader } from "../../core/ports/notification-reader.port.js"

export interface UnreadCountDeps {
  notificationReader: NotificationReader
}

export function unreadCountQuery(deps: UnreadCountDeps) {
  return async function execute(accountId: string) {
    return await deps.notificationReader.countUnreadNotifications(accountId)
  }
}
