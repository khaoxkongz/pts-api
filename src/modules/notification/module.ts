import { Elysia } from "elysia"

import { notificationRoutes } from "./api/notification.routes.js"
import { type PushHub } from "./core/ports/push-hub.port.js"

export interface NotificationModuleDeps {
  pushHub: PushHub
}

export function notificationModule(deps: NotificationModuleDeps) {
  return new Elysia({ name: "notification-module", prefix: "/notifications" }).use(
    notificationRoutes({ pushHub: deps.pushHub })
  )
}
