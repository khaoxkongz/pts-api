import { Elysia } from "elysia"

import { resolveSessionUser } from "@/modules/auth/service.js"
import { requestSessionCredentials } from "@/modules/auth/utils.js"
import { session } from "@/plugins/session.js"

import { Inbox } from "./inbox.js"
import { NotificationSchema } from "./model.js"
import { appPush, pushHub } from "./runtime.js"

export const notification = new Elysia({ name: "notification-module", prefix: "/notifications" })
  .use(session)

  .get(
    "",
    async ({ user, query, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      const data = await Inbox.listPage(user.accountId, query.page, query.pageSize)

      return status(200, {
        success: true,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
        data: data.notifications,
      })
    },
    {
      isAuth: true,
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

      const unreadCount = await Inbox.countUnread(user.accountId)

      return status(200, { success: true, data: { unreadCount } })
    },
    {
      isAuth: true,
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

      const notification = await Inbox.markRead(user.accountId, params.notificationId)

      if (!notification) {
        return status(404, { success: false, message: "ไม่พบการแจ้งเตือนที่ระบุ" })
      }

      // Not awaited: the App Badge is best effort and must never slow down or fail marking as read (ADR-0004).
      void appPush.syncBadge(user.accountId)

      return status(200, { success: true, message: "ทำเครื่องหมายว่าอ่านแล้วสำเร็จ" })
    },
    {
      isAuth: true,
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

      const modifiedCount = await Inbox.markAllRead(user.accountId)

      if (modifiedCount > 0) {
        // Not awaited, like mark-read: the App Badge is best effort (ADR-0004).
        void appPush.syncBadge(user.accountId)
      }

      return status(200, { success: true, message: `ทำเครื่องหมายว่าอ่านแล้ว ${modifiedCount} รายการ` })
    },
    {
      isAuth: true,
      detail: {
        description: "ใช้สำหรับทำเครื่องหมายว่าอ่านแล้วทั้งหมด",
        tags: ["Notification"],
      },
    }
  )

  .get(
    "/stream",
    async ({ headers, cookie, query, status }) => {
      const resolved = await resolveSessionUser(requestSessionCredentials({ headers, cookie, queryToken: query.token }))
      const user = resolved?.user

      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      return pushHub.createStreamResponse(user.accountId)
    },
    {
      query: NotificationSchema.streamQuery,
      detail: {
        description: "ใช้สำหรับสร้าง stream ของการแจ้งเตือน",
        tags: ["Notification"],
      },
    }
  )
