import { Elysia } from "elysia"

import { session } from "@/plugins/session.js"

import { NotificationSchema } from "./notification.schema.js"

export interface NotificationRoutesQueries {
  listNotifications(
    accountId: string,
    page: number | undefined,
    pageSize: number | undefined
  ): Promise<{ totalCount: number; totalPages: number; notifications: unknown[] }>
  getUnreadCount(accountId: string): Promise<number>
}

export interface NotificationRoutesCommands {
  markNotificationRead(accountId: string, notificationId: string): Promise<unknown>
  markAllNotificationsRead(accountId: string): Promise<number>
}

export interface NotificationRoutesStream {
  resolveUser(params: { rawToken?: string | null; signedToken?: string | null }): Promise<{ accountId: string } | null>
  createStreamResponse(accountId: string): Response
}

export function notificationRoutes(
  notificationQueries: NotificationRoutesQueries,
  notificationCommands: NotificationRoutesCommands,
  notificationStream: NotificationRoutesStream
) {
  return new Elysia()
    .use(session)

    .get(
      "",
      async ({ user, query, status }) => {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
        }

        const data = await notificationQueries.listNotifications(user.accountId, query.page, query.pageSize)

        return status(200, {
          success: true,
          totalCount: data.totalCount,
          totalPages: data.totalPages,
          data: data.notifications,
        })
      },
      {
        isAuth: true,
        isAuthWithToken: true,
        query: NotificationSchema.notificationListQuery,
        detail: {
          description: "ใช้สำหรับดูข้อมูลของการแจ้งเตือน",
          tags: ["Notification"],
        },
      }
    )

    .get(
      "/unread-count",
      async ({ user, status }) => {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
        }

        const unreadCount = await notificationQueries.getUnreadCount(user.accountId)

        return status(200, { success: true, data: { unreadCount } })
      },
      {
        isAuth: true,
        isAuthWithToken: true,
        detail: {
          description: "ใช้สำหรับดูจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน",
          tags: ["Notification"],
        },
      }
    )

    .patch(
      "/:notificationId/read",
      async ({ user, params, status }) => {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
        }

        const notification = await notificationCommands.markNotificationRead(user.accountId, params.notificationId)

        if (!notification) {
          return status(404, { success: false, message: "ไม่พบการแจ้งเตือนที่ระบุ" })
        }

        return status(200, { success: true, message: "ทำเครื่องหมายว่าอ่านแล้วสำเร็จ" })
      },
      {
        isAuth: true,
        isAuthWithToken: true,
        params: NotificationSchema.notificationIdParams,
        detail: {
          description: "ใช้สำหรับทำเครื่องหมายว่าอ่านแล้ว",
          tags: ["Notification"],
        },
      }
    )

    .post(
      "/read-all",
      async ({ user, status }) => {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
        }

        const modifiedCount = await notificationCommands.markAllNotificationsRead(user.accountId)

        return status(200, { success: true, message: `ทำเครื่องหมายว่าอ่านแล้ว ${modifiedCount} รายการ` })
      },
      {
        isAuth: true,
        isAuthWithToken: true,
        detail: {
          description: "ใช้สำหรับทำเครื่องหมายว่าอ่านแล้วทั้งหมด",
          tags: ["Notification"],
        },
      }
    )

    .get(
      "/stream",
      async ({ headers, cookie, query, status }) => {
        const headerToken = typeof headers["x-authorized-token"] === "string" ? headers["x-authorized-token"] : null
        const bearerToken =
          typeof headers["authorization"] === "string" ? headers["authorization"].replace(/^Bearer\s+/i, "") : null
        const queryToken = typeof query.token === "string" ? query.token : null
        const rawToken = headerToken || bearerToken || queryToken
        const signedToken = typeof cookie["auth"]?.value === "string" ? cookie["auth"].value : null

        const user = await notificationStream.resolveUser({ rawToken, signedToken })

        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
        }

        return notificationStream.createStreamResponse(user.accountId)
      },
      {
        query: NotificationSchema.streamQuery,
        detail: {
          description: "ใช้สำหรับสร้าง stream ของการแจ้งเตือน",
          tags: ["Notification"],
        },
      }
    )
}
