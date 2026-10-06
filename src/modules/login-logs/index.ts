import { Elysia, t } from "elysia"

import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"

import * as AccessLogService from "./access-log-service.js"
import { recordAccessLog } from "./access-log-store.js"
import { authenticateBearer } from "./auth.js"
import { formatBangkokDateTimeTh } from "./format-date.js"
import { resolveIp, toQueryRecord } from "./logic.js"
import * as LoginLogsModel from "./model.js"
import * as LoginLogsService from "./service.js"
import * as TokenService from "./token-service.js"

const UNAUTHORIZED_MESSAGE = "ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลนี้"
const SESSION_EXPIRED_MESSAGE = "Cookie Token หมดอายุ หรือไม่ถูกต้อง"
const FORBIDDEN_MESSAGE = "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้"
const INTERNAL_ERROR_MESSAGE = "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์"

const ADMIN_ERROR_RESPONSES = {
  400: LoginLogsModel.ErrorResponse,
  401: LoginLogsModel.ErrorResponse,
  403: LoginLogsModel.ErrorResponse,
  404: LoginLogsModel.ErrorResponse,
  500: LoginLogsModel.ErrorResponse,
}

export const loginLogs = new Elysia({ prefix: "/login-logs" })
  .use(session)
  .use(roles)

  .get(
    "/",
    async ({ status, headers, query, request }) => {
      const startedAt = Date.now()
      const requestedAt = new Date()
      const outcome = await authenticateBearer(headers.authorization)

      // ประกอบ log จาก method/path/query/ip/user-agent เท่านั้น ไม่แตะ header Authorization
      const context = {
        caller: outcome.key?.holder ?? null,
        key_id: outcome.key?.key_id ?? null,
        key_prefix: outcome.key?.key_prefix ?? null,
        method: "GET",
        path: "/login-logs",
        query: toQueryRecord(query),
        ip: resolveIp(headers["x-forwarded-for"], request),
        user_agent: request.headers.get("user-agent") ?? "",
        requestedAt,
        requestedAtTh: formatBangkokDateTimeTh(requestedAt),
      }

      const writeLog = (statusCode: number, resultCount: number): void => {
        recordAccessLog({
          ...context,
          status_code: statusCode,
          result_count: resultCount,
          duration_ms: Date.now() - startedAt,
        })
      }

      // ไม่บอกรายละเอียดว่าผิดเพราะไม่มี key, key ผิด, หมดอายุ หรือถูกเพิกถอน
      if (!outcome.ok) {
        writeLog(401, 0)

        return status(401, { success: false, message: UNAUTHORIZED_MESSAGE })
      }

      try {
        const result = await LoginLogsService.getLoginLogs()

        writeLog(200, result.length)

        return status(200, result)
      } catch (error) {
        console.error("[login-logs]", error)
        writeLog(500, 0)

        return status(500, { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูล login logs" })
      }
    },
    {
      response: {
        200: LoginLogsModel.LoginLogsResult,
        401: LoginLogsModel.ErrorResponse,
        500: LoginLogsModel.ErrorResponse,
      },
      detail: {
        description: "ดึงข้อมูลการเข้าสู่ระบบล่าสุดของผู้ใช้ทั้งหมด ต้องยืนยันตัวตนด้วย share key",
        tags: ["Login Logs"],
      },
    }
  )

  .post(
    "/tokens",
    async ({ body, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: SESSION_EXPIRED_MESSAGE })
        }

        if (!authorized) {
          return status(403, { success: false, message: FORBIDDEN_MESSAGE })
        }

        const result = await TokenService.createToken(body, user.accountId)

        if (!result.ok) {
          return status(400, {
            success: false,
            message:
              result.reason === "user-not-found"
                ? "ไม่พบผู้ใช้ตาม account_id ที่ระบุ"
                : "ต้องระบุ account_id หรือ holderName อย่างน้อยหนึ่งอย่าง",
          })
        }

        return status(201, {
          success: true,
          message: "สร้าง key สำเร็จ กรุณาบันทึก token ไว้ ระบบจะไม่แสดงค่านี้อีก",
          data: { token: result.token, key: result.key },
        })
      } catch (error) {
        console.error("[login-logs]", error)

        return status(500, { success: false, message: INTERNAL_ERROR_MESSAGE })
      }
    },
    {
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      body: LoginLogsModel.CreateTokenBody,
      response: { 201: LoginLogsModel.CreateTokenResponse, ...ADMIN_ERROR_RESPONSES },
      detail: {
        description: "สร้าง share key สำหรับเรียก /login-logs โดยผูกกับเจ้าของ คืนค่า token ครั้งเดียวเท่านั้น",
        tags: ["Login Logs"],
      },
    }
  )

  .get(
    "/tokens",
    async ({ user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: SESSION_EXPIRED_MESSAGE })
        }

        if (!authorized) {
          return status(403, { success: false, message: FORBIDDEN_MESSAGE })
        }

        return status(200, {
          success: true,
          message: "ดึงรายการ key สำเร็จ",
          data: await TokenService.listTokens(),
        })
      } catch (error) {
        console.error("[login-logs]", error)

        return status(500, { success: false, message: INTERNAL_ERROR_MESSAGE })
      }
    },
    {
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      response: { 200: LoginLogsModel.TokenListResponse, ...ADMIN_ERROR_RESPONSES },
      detail: {
        description: "ดูรายการ key ทั้งหมด แสดงเฉพาะ prefix ไม่แสดงค่า key จริง",
        tags: ["Login Logs"],
      },
    }
  )

  .delete(
    "/tokens/:id",
    async ({ params, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: SESSION_EXPIRED_MESSAGE })
        }

        if (!authorized) {
          return status(403, { success: false, message: FORBIDDEN_MESSAGE })
        }

        const result = await TokenService.revokeToken(params.id, user.accountId)

        if (!result.ok) {
          return status(404, { success: false, message: "ไม่พบ key ที่ระบุ" })
        }

        return status(200, { success: true, message: "เพิกถอน key สำเร็จ", data: result.key })
      } catch (error) {
        console.error("[login-logs]", error)

        return status(500, { success: false, message: INTERNAL_ERROR_MESSAGE })
      }
    },
    {
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      params: t.Object({ id: t.String() }),
      response: { 200: LoginLogsModel.RevokeTokenResponse, ...ADMIN_ERROR_RESPONSES },
      detail: {
        description: "เพิกถอน key ทำให้ share key ใช้ไม่ได้ทันที",
        tags: ["Login Logs"],
      },
    }
  )

  .get(
    "/access-logs",
    async ({ query, user, authorized, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: SESSION_EXPIRED_MESSAGE })
        }

        if (!authorized) {
          return status(403, { success: false, message: FORBIDDEN_MESSAGE })
        }

        return status(200, {
          success: true,
          message: "ดึงข้อมูล access logs สำเร็จ",
          data: await AccessLogService.getAccessLogs(query),
        })
      } catch (error) {
        console.error("[login-logs]", error)

        return status(500, { success: false, message: INTERNAL_ERROR_MESSAGE })
      }
    },
    {
      isAuthWithToken: true,
      requireRole: ["SUPERADMIN"],
      query: LoginLogsModel.AccessLogQuery,
      response: { 200: LoginLogsModel.AccessLogListResponse, ...ADMIN_ERROR_RESPONSES },
      detail: {
        description: "ดูประวัติการเรียก /login-logs ย้อนหลัง กรองด้วย account_id, role, ช่วงวันที่ เรียงจากใหม่ไปเก่า",
        tags: ["Login Logs"],
      },
    }
  )
