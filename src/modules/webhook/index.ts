import { Elysia } from "elysia"

import * as WebhookModel from "./model.js"
import * as WebhookService from "./service.js"

export const webhook = new Elysia({ prefix: "/webhook/digital-workflow" }).post(
  "",
  async ({ body, status }) => {
    try {
      const saved = await WebhookService.saveWebhookData(body)
      const result = await WebhookService.processPlannerStatusUpdates(body)

      if (!result.ok) {
        return status(result.code, { success: false, message: result.message })
      }

      if (result.results.length === 0) {
        return status(200, {
          success: true,
          message: "รับข้อมูล webhook สำเร็จ ไม่มี plannerDocNo ที่ต้องดำเนินการ",
          data: { saved, results: [] },
        })
      }

      return status(200, {
        success: true,
        message: "รับข้อมูล webhook และอัปเดตสถานะแผนงานสำเร็จ",
        data: {
          employeeId: result.employeeId,
          participantStatus: result.participantStatus,
          results: result.results,
        },
      })
    } catch {
      return status(500, {
        success: false,
        message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      })
    }
  },
  {
    body: WebhookModel.webhookBody,
    detail: {
      description: "ใช้สำหรับรับข้อมูล webhook จากระบบ Digital Workflow",
      tags: ["Webhook"],
    },
  }
)

export const webhookWelfare = new Elysia({ prefix: "/webhook/welfare" }).get(
  "",
  async ({ query, status }) => {
    try {
      const result = await WebhookService.getPlannerWelfareInfo(query.plannerDocNo)

      if (!result || result === null) {
        return status(404, {
          success: false,
          message: "ไม่พบข้อมูลโครงการตาม plannerDocNo ที่ระบุ",
        })
      }

      return status(200, {
        success: true,
        message: "ส่งข้อมูลวันเริ่มต้นและวันสิ้นสุดของโครงการสำเร็จ",
        data: {
          plannerDocNo: result.plannerDocNo,
          plannerName: result.plannerName,
          startDate: result.startDate,
          endDate: result.endDate,
        },
      })
    } catch {
      return status(500, {
        success: false,
        message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      })
    }
  },
  {
    query: WebhookModel.webhookQuery,
    detail: {
      description: "ใช้สำหรับส่งข้อมูลวันเริ่มต้นและวันสิ้นสุดของโครงการ",
      tags: ["Webhook"],
    },
  }
)
