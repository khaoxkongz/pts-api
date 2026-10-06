import { type NotificationDocument } from "../notification-dto.js"

export interface NotificationReader {
  findNotifications(accountId: string, skip: number, limit: number): Promise<NotificationDocument[]>
  countNotifications(accountId: string): Promise<number>
  countUnreadNotifications(accountId: string): Promise<number>
}
