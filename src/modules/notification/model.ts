import { t } from "elysia"

export const NotificationSchema = {
  notificationListQuery: t.Object({
    page: t.Optional(t.Number({ default: 1 })),
    pageSize: t.Optional(t.Number({ default: 20 })),
  }),

  notificationIdParams: t.Object({
    notificationId: t.String(),
  }),

  streamQuery: t.Object({
    token: t.Optional(t.String()),
  }),
}
