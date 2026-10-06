import { type NotificationWriter } from "../../core/ports/notification-writer.port.js"

export interface MarkNotificationReadDeps {
  notificationWriter: NotificationWriter
}

export function markNotificationReadCommand(deps: MarkNotificationReadDeps) {
  return async function execute(accountId: string, notificationId: string) {
    return await deps.notificationWriter.markNotificationAsRead(accountId, notificationId)
  }
}
