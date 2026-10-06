import { Elysia, t } from "elysia"
import * as fs from "node:fs"
import * as path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import slug from "slug"
import { v7 } from "uuid"

import { Planner, type TPlanner } from "@/models/planner.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { worthinessModel } from "@/modules/worth/model.js"
import { worthinessService } from "@/modules/worth/service.js"
import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"
import { STATUS } from "@/utils/status/status.js"

const publicDir = path.join(process.cwd(), "upload")
fs.mkdirSync(publicDir, { recursive: true })

export const worthiness = new Elysia({ prefix: "/worthiness" })
  .use(session)
  .use(roles)

  .get(
    "",
    async ({ user, query, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }
        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }
        if (
          query.status !== STATUS.WAITING_PLANNER_COST_ANALYSIS &&
          query.status !== STATUS.GA_COMPLETED &&
          query.status !== STATUS.COMPLETED
        ) {
          query.status = "ALL"
        }

        const data = await worthinessService.getAllPlanner(query)

        return status(200, { success: true, data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["PLANNER", "SUPERADMIN", "FINANCE"],
      query: worthinessModel.queriesWorth,
      detail: {
        description: "ดึงข้อมูลหน้ากำหนดความคุ้มค่า",
        tags: ["Worthiness"],
      },
    }
  )

  .get(
    "/:documentId",
    async ({ user, params, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }
        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const data = await worthinessService.getPlannerByDocumentId(params.documentId)

        return status(200, { success: true, data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["PLANNER", "SUPERADMIN", "FINANCE"],
      detail: {
        description: "ดึงข้อมูลกำหนดความคุ้มค่าตาม Document ID",
        tags: ["Worthiness"],
      },
    }
  )

  .get(
    "check-default",
    async ({ user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }
        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }
        let result: { message: string; default: string }
        if (user.role === "PLANNER") {
          result = await worthinessService.checkDefaultPlanner()
        } else {
          result = { message: "ตำแหน่งงานนี้ไม่ต้องวิเคราะห์ความคุ้มค่า", default: "ALL" }
        }
        return status(200, { success: true, data: result.message, default: result.default })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["PLANNER", "SUPERADMIN", "FINANCE"],
      detail: {
        description: "ตรวจสอบสถานะเริ่มต้นสำหรับการดึงข้อมูลกำหนดความคุ้มค่า",
        tags: ["Worthiness"],
      },
    }
  )

  .post(
    "/:documentId",
    async ({ user, params, body, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const documentId = params.documentId as string

        const planner = await Planner.findOne({ documentId }).lean()
        if (!planner) {
          return status(404, { success: false, message: "ไม่พบแผนงานที่ต้องการกำหนดความคุ้มค่า" })
        }

        if (!planner.status.includes("WAITING_PLANNER_COST_ANALYSIS")) {
          return status(400, { success: false, message: "แผนงานนี้ไม่อยู่ในสถานะที่สามารถกำหนดความคุ้มค่าได้" })
        }

        const uploadDir = path.join(publicDir, documentId, "worthiness")
        const files = body.worthFiles ? body.worthFiles.flat() : []

        if (body.worthiness.hasFile && files.length === 0) {
          return status(400, { success: false, message: "ระบุว่ามีไฟล์ แต่ไม่พบไฟล์แนบ" })
        }

        let uploadedFiles: worthinessModel.worthFileType[] = []

        if (files.length > 0) {
          try {
            fs.mkdirSync(uploadDir, { recursive: true })

            uploadedFiles = await Promise.all(
              files.map(async (file) => {
                const uuid = v7()
                const ext = path.extname(file.name)
                const nameWithoutExt = path.basename(file.name, ext)
                const fileName = `${uuid}_${slug(nameWithoutExt, "-")}${ext}`
                const filepath = path.join(uploadDir, fileName)

                const sourceStream = Readable.fromWeb(file.stream())
                const destStream = fs.createWriteStream(filepath)
                await pipeline(sourceStream, destStream)

                return {
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  url: `/worthiness/${documentId}/worthiness/${fileName}`,
                  uuid,
                  createdBy: user.accountId,
                }
              })
            )
          } catch {
            fs.rmSync(uploadDir, { recursive: true, force: true })
            return status(500, { success: false, message: "เกิดข้อผิดพลาดในการอัปโหลดไฟล์" })
          }
        }

        const plannerBefore = planner

        const updatedPlanner = await worthinessService.insertWorth(
          documentId,
          body.worthiness.worthiness,
          body.worthiness.reason,
          body.worthiness.hasFile,
          uploadedFiles
        )

        if (!updatedPlanner) {
          return status(500, { success: false, message: "ไม่สามารถบันทึกข้อมูลกำหนดความคุ้มค่าได้" })
        }

        await workflowEventDispatcher
          .dispatch({
            type: "PLANNER_ANALYSIS_COMPLETED",
            payload: {
              plannerBefore: plannerBefore as TPlanner,
              plannerAfter: updatedPlanner as TPlanner,
            },
            meta: {
              actorAccountId: user.accountId,
            },
          })
          .catch((error) => {
            console.error("Failed to record planner analysis completed workflow event:", error)
          })

        return status(200, { success: true, message: "บันทึกข้อมูลกำหนดความคุ้มค่าเรียบร้อยแล้ว" })
      } catch (error) {
        console.error(error)
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["PLANNER"],
      params: t.Object({
        documentId: t.String(),
      }),
      body: worthinessModel.InsertWorth,
      detail: {
        description: "เพิ่มข้อมูลกำหนดความคุ้มค่า",
        tags: ["Worthiness"],
      },
    }
  )

  .get(
    "/:documentId/:by/:filename",
    ({ params, set }) => {
      const { documentId, by, filename } = params

      if (documentId.includes("..") || filename.includes("..")) {
        set.status = 400
        return "Invalid path"
      }

      const filePath = path.join(publicDir, documentId, by, filename)

      if (!fs.existsSync(filePath)) {
        set.status = 404
        return { success: false, message: "File not found" }
      }

      set.headers["Content-Type"] = getMime(filename)
      set.headers["Content-Disposition"] = "inline"

      return fs.createReadStream(filePath)
    },
    {
      params: t.Object({
        documentId: t.String(),
        by: t.String(),
        filename: t.String(),
      }),
      detail: {
        tags: ["Worthiness"],
      },
    }
  )

function getMime(name: string) {
  if (name.endsWith(".pdf")) {
    return "application/pdf"
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (name.endsWith(".png")) {
    return "image/png"
  }
  return "application/octet-stream"
}
