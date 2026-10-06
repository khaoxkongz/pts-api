import { type TPlannerNotification } from "@/models/planner-notification.js"

export type NotificationDocument = TPlannerNotification & { _id: { toString(): string } }

export function toNotificationDto(notification: NotificationDocument) {
  const jvTaxId = notification.data?.jvTaxId ? String(notification.data.jvTaxId) : undefined
  const resetJvTaxIds = Array.isArray(notification.data?.resetJvTaxIds)
    ? notification.data.resetJvTaxIds.map(String)
    : []
  const transactionId = notification.data?.transactionId ? String(notification.data.transactionId) : undefined
  const pendingConfirmExpireAt = notification.data?.pendingConfirmExpireAt
    ? String(notification.data.pendingConfirmExpireAt)
    : undefined
  const cancellationReason = notification.data?.cancellationReason
    ? String(notification.data.cancellationReason)
    : undefined

  return {
    id: notification._id.toString(),
    eventType: notification.eventType,
    recipientKind: notification.recipientKind,
    title: notification.title,
    body: notification.body,
    sourceType: notification.sourceType,
    sourceId: notification.sourceId,
    sourceName: notification.sourceName,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt?.toISOString() ?? new Date().toISOString(),
    data: {
      documentId: String(notification.data?.documentId ?? notification.sourceId),
      ...(jvTaxId ? { jvTaxId } : {}),
      ...(resetJvTaxIds.length > 0 ? { resetJvTaxIds } : {}),
      ...(transactionId ? { transactionId } : {}),
      ...(pendingConfirmExpireAt ? { pendingConfirmExpireAt } : {}),
      ...(cancellationReason ? { cancellationReason } : {}),
    },
  }
}
