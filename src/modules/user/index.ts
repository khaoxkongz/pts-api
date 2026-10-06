import { Elysia, t } from "elysia"

import { session } from "@/plugins/session.js"

import * as UserService from "./service.js"

export const userRA = new Elysia({ prefix: "/users/ra" })
  .use(session)

  .get(
    "",
    async ({ query, user, status }) => {
      try {
        const result = await UserService.searchUsers(query.q, user?.accountId, query.cursor)

        return status(200, {
          status: 200,
          success: true,
          message: "ค้นหา location สำเร็จ",
          data: result,
        })
      } catch {
        return status(500, {
          status: 500,
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      query: t.Object({
        q: t.Optional(t.String({ description: "ค้นหาที่อยู่ของแผนงานที่ต้องการดูข้อมูล" })),
        cursor: t.Optional(t.String()),
      }),
      detail: {
        description: "ใช้สำหรับค้นหาที่อยู่ของแผนงานที่ต้องการดูข้อมูล",
        tags: ["Planner"],
      },
    }
  )
