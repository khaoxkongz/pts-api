import { type NotificationWriter } from "../../core/ports/notification-writer.port.js"

export interface MarkAllNotificationsReadDeps {
  notificationWriter: NotificationWriter
}

export function markAllNotificationsReadCommand(deps: MarkAllNotificationsReadDeps) {
  return async function execute(accountId: string) {
    return await deps.notificationWriter.markAllNotificationsAsRead(accountId)
  }
}
