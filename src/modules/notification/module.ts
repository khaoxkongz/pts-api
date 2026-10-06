import { Elysia } from "elysia"

import { notificationRoutes, type NotificationRoutesDeps } from "./api/notification.routes.js"

export function notificationModule(deps: NotificationRoutesDeps) {
  return new Elysia({ name: "notification-module", prefix: "/notifications" }).use(notificationRoutes(deps))
}
