import { Elysia, t } from "elysia"

import * as LocationService from "./service.js"

export const location = new Elysia({ prefix: "/locations" })
  .post(
    "",
    async ({ body, status }) => {
      try {
        await LocationService.upsertLocations(body)

        return status(200, { success: true, message: "สร้าง location สำเร็จ" })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      body: t.Array(
        t.Object({
          name: t.String(),
          addressNo: t.String(),
          soi: t.String(),
          village: t.String(),
          street: t.String(),
          district: t.String(),
          province: t.String(),
          subdistrict: t.String(),
          zipcode: t.String(),
        })
      ),
      detail: {
        description: "ใช้สำหรับสร้างแผนงานใหม่",
        tags: ["Location"],
      },
    }
  )

  .get(
    "",
    async ({ query, status }) => {
      try {
        const result = await LocationService.searchLocations(query.q)

        return status(200, {
          success: true,
          message: "ค้นหา location สำเร็จ",
          data: result,
        })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ description: "ค้นหาที่อยู่ของแผนงานที่ต้องการดูข้อมูล" })),
      }),
      detail: {
        description: "ใช้สำหรับค้นหาที่อยู่ของแผนงานที่ต้องการดูข้อมูล",
        tags: ["Location"],
      },
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Array(
            t.Object({
              name: t.String(),
              addressNo: t.String(),
              soi: t.String(),
              village: t.String(),
              street: t.String(),
              district: t.String(),
              province: t.String(),
              subdistrict: t.String(),
              zipcode: t.String(),
              normalizedName: t.String(),
            })
          ),
        }),
        500: t.Object({ success: t.Boolean(), message: t.String() }),
      },
    }
  )
