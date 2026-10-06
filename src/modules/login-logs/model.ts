import { t } from "elysia"

export const LoginLogsResult = t.Array(
  t.Object({
    name: t.String(),
    email: t.String(),
    emailOneId: t.String(),
    account_id: t.String(),
    updatedAt: t.Nullable(t.String()),
    updatedAtFormatted: t.String({ description: "เวลาเข้าสู่ระบบล่าสุด รูปแบบ dd/mm/yyyy hh:mm:ss ตามเวลาไทย (ปี ค.ศ.)" }),
    biz_details: t.Array(
      t.Object({
        biz_name: t.String(),
        employee_id: t.String(),
      })
    ),
  })
)

export const ErrorResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
})

export const LoginLogsRole = t.String()

const Holder = t.Object({
  account_id: t.String(),
  email: t.Array(t.String()),
  full_name: t.String(),
  role: LoginLogsRole,
})

export const CreateTokenBody = t.Object({
  account_id: t.Optional(t.String({ description: "accountId ของผู้ใช้ในระบบ ระบบจะดึงอีเมลและชื่อมาเก็บเป็นเจ้าของ key" })),
  holderName: t.Optional(t.String({ description: "ชื่อเจ้าของ key ใช้เมื่อไม่ได้ระบุ account_id" })),
  holderEmail: t.Optional(t.String({ description: "อีเมลเจ้าของ key ใช้เมื่อไม่ได้ระบุ account_id" })),
  role: t.String({ minLength: 1, description: "บทบาทของเจ้าของ key เช่น DEV, OD" }),
  expiresInDays: t.Optional(t.Number({ minimum: 1, maximum: 3650, description: "อายุ key เป็นวัน ไม่ระบุคือไม่มีวันหมดอายุ" })),
})

const TokenSummary = t.Object({
  id: t.String(),
  prefix: t.String(),
  holder: Holder,
  expiresAt: t.Nullable(t.String()),
  revokedAt: t.Nullable(t.String()),
  lastUsedAt: t.Nullable(t.String()),
  createdAt: t.Nullable(t.String()),
  createdBy: t.String(),
  revokedBy: t.String(),
})

export const CreateTokenResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: t.Object({
    token: t.String({ description: "key ตัวจริง แสดงครั้งเดียวเท่านั้น ระบบไม่เก็บค่านี้ไว้" }),
    key: TokenSummary,
  }),
})

export const TokenListResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: t.Array(TokenSummary),
})

export const RevokeTokenResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: TokenSummary,
})

export const AccessLogQuery = t.Object({
  account_id: t.Optional(t.String()),
  role: t.Optional(LoginLogsRole),
  from: t.Optional(t.String({ description: "วันที่เริ่มต้น เช่น 2026-09-01 ตีความตามเวลาไทย" })),
  to: t.Optional(t.String({ description: "วันที่สิ้นสุด เช่น 2026-09-22 ตีความตามเวลาไทย" })),
  page: t.Optional(t.Number({ minimum: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
})

export const AccessLogListResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: t.Object({
    items: t.Array(
      t.Object({
        id: t.String(),
        caller: t.Nullable(Holder),
        key_id: t.Nullable(t.String()),
        key_prefix: t.Nullable(t.String()),
        method: t.String(),
        path: t.String(),
        query: t.Record(t.String(), t.String()),
        status_code: t.Number(),
        result_count: t.Number(),
        ip: t.String(),
        user_agent: t.String(),
        duration_ms: t.Number(),
        requestedAt: t.String(),
        requestedAtTh: t.String(),
      })
    ),
    page: t.Number(),
    limit: t.Number(),
    total: t.Number(),
    totalPages: t.Number(),
  }),
})
