import { consola } from "consola"
import { Elysia, t } from "elysia"

import { session } from "@/plugins/session.js"

import { internalServerError, queriesExportPlanner, unauthorizedError, exportColumnProjection } from "./model.js"
import * as ExportService from "./service.js"
import { generateExportFilename } from "./utils.js"

export const exportModule = new Elysia({ prefix: "/export" })
  .use(session)

  .post(
    "/planner",
    async ({ body, user, set, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          })
        }

        const { filter } = body

        // Generate Excel buffer
        const buffer = await ExportService.generatePlannerExcel({
          filter,
          columns: body.columns,
        })

        // Set response headers for file download
        const filename = generateExportFilename()
        set.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        set.headers["Content-Disposition"] = `attachment; filename="${filename}"`
        set.headers["Content-Length"] = String(buffer.length)

        return new Uint8Array(buffer)
      } catch (error) {
        consola.error("[Export] Failed to generate planner Excel:", error)
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดในการ export ข้อมูล",
        })
      }
    },
    {
      isAuth: true,
      body: t.Object({
        filter: queriesExportPlanner,
        columns: t.Optional(exportColumnProjection),
      }),
      response: {
        200: t.Uint8Array(),
        401: unauthorizedError,
        500: internalServerError,
      },
      detail: {
        description: "Export ข้อมูล Planner เป็นไฟล์ Excel (.xlsx) แบบเลือกคอลัมน์ได้",
        tags: ["Export"],
      },
    }
  )
