import { t } from "elysia"

export const NotificationSchema = {
  notificationData: t.Object({
    documentId: t.String(),
    transactionId: t.Optional(t.String()),
    pendingConfirmExpireAt: t.Optional(t.String()),
    cancellationReason: t.Optional(t.String()),
  }),

  notificationItem: t.Object({
    id: t.String(),
    eventType: t.String(),
    title: t.String(),
    body: t.String(),
    sourceType: t.String(),
    sourceId: t.String(),
    sourceName: t.String(),
    readAt: t.Nullable(t.String()),
    createdAt: t.String(),
    data: t.Object({
      documentId: t.String(),
      transactionId: t.Optional(t.String()),
      pendingConfirmExpireAt: t.Optional(t.String()),
      cancellationReason: t.Optional(t.String()),
    }),
  }),

  notificationListQuery: t.Object({
    page: t.Optional(t.Number({ default: 1 })),
    pageSize: t.Optional(t.Number({ default: 20 })),
  }),

  unreadCountResponse: t.Object({
    unreadCount: t.Number(),
  }),

  successResponse: t.Object({
    success: t.Boolean(),
    message: t.String(),
  }),

  notificationIdParams: t.Object({
    notificationId: t.String(),
  }),

  streamQuery: t.Object({
    token: t.Optional(t.String()),
  }),
}
