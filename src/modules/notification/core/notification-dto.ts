import { type ResolvedNotification } from "./rules/types.js"
import { type RecipientKind, type WorkflowEventType } from "./types.js"

export interface StoredNotification {
  _id: { toString(): string }
  eventId: string
  eventType: WorkflowEventType
  accountId: string
  recipientKind: RecipientKind
  templateKey: string
  title: string
  body: string
  sourceType: string
  sourceId: string
  sourceName?: string | null
  data?: Partial<ResolvedNotification["data"]> | null
  readAt?: Date | null
  createdAt?: Date | null
}

export function toNotificationDto(notification: StoredNotification) {
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
