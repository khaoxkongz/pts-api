import { Elysia, t } from "elysia"

import env from "@/env.js"

import * as AllowanceModel from "./model.js"
import * as AllowanceService from "./service.js"
import * as AllowanceType from "./type.js"

export const allowance = new Elysia({ prefix: "/allowance" }).get(
  "/preview",
  async ({ query, status }) => {
    try {
      const result = await AllowanceService.previewAllowanceRecords({
        employeeId: query.employeeId,
        startDate: query.startDate,
        endDate: query.endDate,
        config: {
          baseUrl: env.ALLOWANCE_API_BASE_URL,
          user: env.ALLOWANCE_API_USER,
          pass: env.ALLOWANCE_API_PASS,
          timeoutMs: env.ALLOWANCE_API_TIMEOUT_MS,
        },
      })

      return status(200, { success: true, message: "ส่งข้อมูลเบี้ยเลี้ยงสำเร็จ", data: result })
    } catch (error) {
      if (AllowanceType.isAllowancePreviewAggregateError(error)) {
        return status(502, { success: false, message: "ไม่สามารถดึงข้อมูลจากระบบภายในได้", errors: error.errors })
      }

      return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
    }
  },
  {
    query: t.Object({
      employeeId: t.String(),
      startDate: t.String({ format: "date" }),
      endDate: t.String({ format: "date" }),
    }),
    body: AllowanceModel.allowancePreviewInput,
    response: {
      200: AllowanceModel.allowancePreviewSuccess,
      400: AllowanceModel.allowanceBadRequestError,
      401: AllowanceModel.allowanceUnauthorizedError,
      502: AllowanceModel.allowancePreviewFailure,
      500: AllowanceModel.allowanceInternalServerError,
    },
    detail: {
      description: "ตัวกลางเรียกข้อมูลเบี้ยเลี้ยงจาก DWF และ WF สำหรับ frontend",
      tags: ["Allowance"],
    },
  }
)
