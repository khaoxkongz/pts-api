import { Elysia } from "elysia"

import { session } from "@/plugins/session.js"

import * as ParticipantModel from "./model.js"
import * as ParticipantService from "./service.js"

export const participant = new Elysia({ prefix: "/participants" })
  .use(session)
  .post(
    "/confirm-cancel",
    async ({ body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      try {
        const result = await ParticipantService.confirmPendingParticipant(
          body.documentId,
          body.employeeId,
          body.type,
          body.month,
          user.accountId
        )
        if (!result.ok) {
          return status(result.code, { success: false, message: result.message })
        }
        return status(200, { success: true, message: result.message })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      body: ParticipantModel.confirmCancelBody,
      detail: {
        description:
          "ยืนยันผลของผู้เข้าร่วมที่อยู่ในสถานะรอยืนยัน (ปฏิเสธ/ยกเลิก) ทันที (ข้ามการรอ 5 วัน) — ระบุ month (YYYY-MM) เพื่อยืนยันเฉพาะเดือนนั้น มิฉะนั้นยืนยันทุกเดือนที่รอยืนยันประเภทเดียวกัน",
        tags: ["Participant"],
      },
    }
  )
  .post(
    "/cancel-by-month",
    async ({ body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      try {
        const result = await ParticipantService.cancelAllowanceClaimed(
          body.documentId,
          body.employeeId,
          body.month,
          user.accountId
        )
        if (!result.ok) {
          return status(result.code, { success: false, message: result.message })
        }
        return status(200, { success: true, message: result.message })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      body: ParticipantModel.cancelByMonthBody,
      detail: {
        description:
          "ยกเลิกการเบิกเบี้ยเลี้ยงของผู้เข้าร่วมในเดือนที่ระบุ (YYYY-MM) — ยกเลิกได้เฉพาะเดือนที่ยังไม่เริ่มดำเนินการเบิก (PENDING) และจะเปลี่ยนเป็นยกเลิก (CANCEL) ทันที",
        tags: ["Participant"],
      },
    }
  )
