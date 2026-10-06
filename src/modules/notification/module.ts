import { Elysia } from "elysia"

import { notificationRoutes } from "./api/notification.routes.js"
import { type PushHub } from "./core/ports/push-hub.port.js"
import { streamAuthService, type StreamAuthServiceDeps } from "./use-cases/services/stream-auth.service.js"

export interface NotificationModuleDeps extends StreamAuthServiceDeps {
  pushHub: PushHub
}

export function notificationModule(deps: NotificationModuleDeps) {
  return new Elysia({ name: "notification-module", prefix: "/notifications" }).use(
    notificationRoutes({
      streamAuthService: streamAuthService(deps),
      pushHub: deps.pushHub,
    })
  )
}
