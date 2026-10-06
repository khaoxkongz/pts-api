import { Elysia } from "elysia"

import { notificationRoutes } from "./api/notification.routes.js"
import { type NotificationWriter } from "./core/ports/notification-writer.port.js"
import { type PushHub } from "./core/ports/push-hub.port.js"
import { notificationInboxQuery, type NotificationInboxDeps } from "./use-cases/queries/notification-inbox.query.js"
import { streamAuthService, type StreamAuthServiceDeps } from "./use-cases/services/stream-auth.service.js"

export interface NotificationModuleDeps extends NotificationInboxDeps, StreamAuthServiceDeps {
  notificationWriter: NotificationWriter
  pushHub: PushHub
}

export function notificationModule(deps: NotificationModuleDeps) {
  return new Elysia({ name: "notification-module", prefix: "/notifications" }).use(
    notificationRoutes({
      listNotifications: notificationInboxQuery(deps),
      notificationReader: deps.notificationReader,
      notificationWriter: deps.notificationWriter,
      streamAuthService: streamAuthService(deps),
      pushHub: deps.pushHub,
    })
  )
}
