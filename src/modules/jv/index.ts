import { Elysia, t } from "elysia"

import * as JVModel from "@/modules/jv/model.js"
import * as JVService from "@/modules/jv/service.js"
import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"

export const jv = new Elysia({ prefix: "/jv" })
  .use(session)
  .use(roles)

  .get(
    "/:documentId",
    async ({ params, status }) => {
      try {
        const jvData = await JVService.getAllJvsByDocumentId(params.documentId)

        if (!jvData) {
          return status(404, { success: false, message: "ไม่พบแผนงานที่ระบุ" })
        }

        const response = jvData.map((jv) => ({
          taxId: jv.taxId,
          companyFullNameTh: jv.companyFullNameTh,
          companyFullNameEng: jv.companyFullNameEng,
          percentageRatio: jv.percentageRatio,
          expenseRatio: jv.expenseRatio,
          actualPercentageRatio: jv.actualPercentageRatio,
          actualExpenseRatio: jv.actualExpenseRatio,
          approversList: jv.approversList?.map((approver) => ({
            employeeId: approver.employeeId,
            nameTh: approver.nameTh,
            accountId: approver.accountId,
          })),
          status: jv.status,
          rejectionReason: jv.rejectionReason || "",
        }))

        return status(200, { success: true, data: response })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      detail: {
        description: "ดึงข้อมูล JV ตามเลขประจำตัวผู้เสียภาษี",
        tags: ["JV"],
      },
      params: t.Object({
        documentId: t.String(),
      }),
    }
  )

  .post(
    "/approve",
    async ({ body, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง",
          })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const results = await JVService.approveJV({
          documentId: body.documentId,
          jvs: body.jvs.map((item) => ({
            taxId: item.taxId,
            ratio: {
              percentage: item.percentageRatio,
              expense: item.expenseRatio,
            },
          })),
          me: {
            userId: user.accountId,
            role: user.role,
          },
        })

        return results
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GM"],
      body: JVModel.RequestBodyApproveJV,
      detail: {
        description: "ใช้สำหรับอนุมัติ JV",
        tags: ["JV"],
      },
    }
  )

  .post(
    "/reject",
    async ({ body, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง",
          })
        }

        if (!authorized) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const results = await JVService.rejectJV({
          documentId: body.documentId,
          jvs: body.jvs,
          me: {
            userId: user.accountId,
            role: user.role,
          },
        })

        return results
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      requireRole: ["GM"],
      body: JVModel.RequestBodyRejectJV,
      detail: {
        description: "ใช้สำหรับปฏิเสธ JV",
        tags: ["JV"],
      },
    }
  )
