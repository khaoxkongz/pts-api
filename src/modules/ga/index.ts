import { Elysia, t } from "elysia"
import * as fs from "node:fs"
import * as path from "node:path"

import { Planner } from "@/models/planner.js"
import * as GAPlannerModel from "@/modules/ga/model.js"
import * as PlannerModel from "@/modules/planner/model.js"
import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"

import * as GAService from "./service.js"

const publicDir = path.join(process.cwd(), "upload")

export const ga = new Elysia({ prefix: "/budget-control" })
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
        if (user.role === "EMPLOYEE" && !user.isSupervisor) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const employeeId: string[] = user.companies.map((c) => c.employeeId)
        const companyName: string[] = user.gmCompany || []
        const data = await GAService.getAllPlanners(
          { userId: employeeId, role: user.role, isSupervisor: user.isSupervisor, companyName },
          query
        )

        return status(200, { success: true, data })
      } catch (error) {
        return status(500, { success: false, message: error })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GA", "GM", "SUPERADMIN", "EMPLOYEE", "PLANNER", "FINANCE"],
      query: GAPlannerModel.queriesGAPlanners,
      detail: { description: "ดึงข้อมูล GA Planner ทั้งหมด", tags: ["Budget"] },
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
        if (user.role === "EMPLOYEE" && !user.isSupervisor) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const employeeId: string[] = user.companies.map((c) => c.employeeId)

        const data = await GAService.checkDefaultPlanner({
          userId: employeeId,
          role: user.role,
          isSupervisor: user.isSupervisor,
        })

        return status(200, { success: true, message: data.message, default: data.default })
      } catch (error) {
        return status(500, { success: false, message: error })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GA", "GM", "SUPERADMIN", "EMPLOYEE", "PLANNER", "FINANCE"],
      detail: { description: "ตรวจสอบการมีอยู่ของ GA Planner เริ่มต้น", tags: ["Budget"] },
    }
  )

  .get(
    ":documentId",
    async ({ user, params, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }
        if (user.role === "EMPLOYEE" && !user.isSupervisor) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const employeeId: string[] = user.companies.map((c) => c.employeeId)

        const data = await GAService.getPlannerByDocumentId(params.documentId, {
          userId: employeeId,
          role: user.role,
          isSupervisor: user.isSupervisor,
        })

        if (!data) {
          return status(404, { success: false, message: "ไม่พบเอกสารดังกล่าว" })
        }

        return status(200, { success: true, data })
      } catch (error) {
        return status(500, { success: false, message: error })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GA", "GM", "SUPERADMIN", "EMPLOYEE", "PLANNER", "FINANCE"],
      params: t.Object({
        documentId: t.String(),
      }),
      detail: {
        description: "ดึงข้อมูล GA Planner ตามรหัสเอกสาร",
        tags: ["Budget"],
      },
    }
  )

  .post(
    "actualbudget/:documentId",
    async ({ params, body, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const planner = await Planner.findOne({ documentId: params.documentId })

        if (!planner) {
          return status(404, { success: false, message: "ไม่พบเอกสารดังกล่าว" })
        }
        if (!planner.status.includes("WAITING_GA_ACTUAL_COST")) {
          return status(409, { success: false, message: "ไม่สามารถแก้ไขค่าใช้จ่ายจริงได้ในสถานะปัจจุบัน" })
        }

        try {
          const actualBudgetMaps = await GAService.processActualBudgetFiles(
            params.documentId,
            body.actualBudget.items,
            body.actualBudgetFiles
          )

          await GAService.updateGaActualBudget(params.documentId, actualBudgetMaps)
          await GAService.confirmActualBudget(params.documentId, user.accountId)

          return status(200, { success: true, message: "ยืนยันค่าใช้จ่ายจริงสำเร็จ" })
        } catch {
          return status(500, { success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" })
        }
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดที่ไม่คาดคิด" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GA"],
      params: t.Object({
        documentId: t.String(),
      }),
      body: GAPlannerModel.insertInputActualBudget,
      detail: {
        description: "แก้ไขค่าใช้จ่ายจริง GA Planner",
        tags: ["Budget"],
      },
    }
  )

  .put(
    "estimated",
    async ({ body, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const planner = await Planner.findOne({ documentId: body.documentId })

        if (!planner) {
          return status(404, { success: false, message: "ไม่พบเอกสารดังกล่าว" })
        }
        if (!planner.status.includes("WAITING_GA_ESTIMATE")) {
          return status(409, { success: false, message: "ไม่สามารถแก้ไขประมาณการค่าใช้จ่ายได้ในสถานะปัจจุบัน" })
        }

        // if es
        const estimatedBudgetItems = mapEstimatedBudget(body.estimatedBudget)
        if (estimatedBudgetItems.length > 0) {
          const data = await GAService.updateEstimate(body.documentId, estimatedBudgetItems)
          if (data.code !== 200) {
            return status(400, { success: false, message: "แก้ไขเอกสารไม่สำเร็จ" })
          }
        }

        const updatedJvs = await GAService.updateJVExpenseAndPercentage(body.documentId, estimatedBudgetItems)
        if (!updatedJvs) {
          return status(400, { success: false, message: "อัปเดตสัดส่วน JV ไม่สำเร็จ" })
        }

        const confirm = await GAService.confirmEstimate(body.documentId, user.accountId)
        if (!confirm) {
          return status(400, { success: false, message: "ยืนยันเอกสารไม่สำเร็จ" })
        }

        return status(200, { success: true, message: "ยืนยันประมาณค่าใช้จ่ายสำเร็จ" })
      } catch (error) {
        return status(500, { success: false, message: error })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GA"],
      body: t.Object({
        documentId: t.String(),
        estimatedBudget: t.Optional(t.Array(PlannerModel.estimatedBudget)),
      }),
      detail: {
        description: "แก้ไขค่าใช้จ่ายประมาณการ GA Planner",
        tags: ["Budget"],
      },
    }
  )

  .get(
    "/:documentId/:by/:filename",
    ({ params, set, status }) => {
      const { documentId, by, filename } = params

      if (documentId.includes("..") || filename.includes("..")) {
        return status(400, { success: false, message: "Invalid path" })
      }

      const filePath = path.join(publicDir, documentId, by, filename)

      if (!fs.existsSync(filePath)) {
        return status(404, { success: false, message: "File not found" })
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
      response: {
        400: t.Object({
          success: t.Boolean(),
          message: t.String(),
        }),
        404: t.Object({
          success: t.Boolean(),
          message: t.String(),
        }),
      },
      detail: {
        tags: ["Budget"],
      },
    }
  )

function mapEstimatedBudget(items?: (typeof PlannerModel.estimatedBudget.static)[]) {
  return (
    items?.map((item) => ({
      type: item.type,
      name: item.name,
      price: item.price,
      sharedWith: item.sharedWith.map((sw) => ({
        accountId: sw.accountId,
        employeeId: sw.employeeId,
        fullNameTh: sw.fullNameTh,
      })),
      remark: item.remark,
    })) || []
  )
}

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
