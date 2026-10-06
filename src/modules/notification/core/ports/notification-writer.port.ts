import { type NotificationDocument } from "../notification-dto.js"

export interface NotificationWriter {
  markNotificationAsRead(accountId: string, notificationId: string): Promise<NotificationDocument | null>
  markAllNotificationsAsRead(accountId: string): Promise<number>
}
