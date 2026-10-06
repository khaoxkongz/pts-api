import { Elysia } from "elysia"

import {
  notificationRoutes,
  type NotificationRoutesCommands,
  type NotificationRoutesQueries,
  type NotificationRoutesStream,
} from "./api/notification.routes.js"
import {
  markAllNotificationsReadCommand,
  type MarkAllNotificationsReadDeps,
} from "./use-cases/commands/mark-all-notifications-read.handler.js"
import {
  markNotificationReadCommand,
  type MarkNotificationReadDeps,
} from "./use-cases/commands/mark-notification-read.handler.js"
import { notificationInboxQuery, type NotificationInboxDeps } from "./use-cases/queries/notification-inbox.query.js"
import { unreadCountQuery, type UnreadCountDeps } from "./use-cases/queries/unread-count.query.js"
import { streamAuthService, type StreamAuthServiceDeps } from "./use-cases/services/stream-auth.service.js"

export interface NotificationModuleDeps
  extends
    NotificationInboxDeps,
    UnreadCountDeps,
    MarkNotificationReadDeps,
    MarkAllNotificationsReadDeps,
    StreamAuthServiceDeps {}

export function notificationModule(deps: NotificationModuleDeps) {
  const notificationQueries: NotificationRoutesQueries = {
    listNotifications: notificationInboxQuery(deps),
    getUnreadCount: unreadCountQuery(deps),
  }

  const notificationCommands: NotificationRoutesCommands = {
    markNotificationRead: markNotificationReadCommand(deps),
    markAllNotificationsRead: markAllNotificationsReadCommand(deps),
  }

  const notificationStreamService: NotificationRoutesStream = streamAuthService(deps)

  return new Elysia({ name: "notification-module", prefix: "/notifications" }).use(
    notificationRoutes(notificationQueries, notificationCommands, notificationStreamService)
  )
}
