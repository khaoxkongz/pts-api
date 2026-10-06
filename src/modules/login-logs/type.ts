import * as LoginLogsModel from "./model.js"

export type LoginLogsRole = string

/** สาเหตุที่ auth ผ่าน/ไม่ผ่าน ใช้ภายในเท่านั้น ไม่ส่งออกไปถึง client */
export type LoginLogsAuthReason = "ok" | "missing" | "invalid" | "revoked" | "expired"

export interface LoginLogsHolder {
  account_id: string
  email: string[]
  full_name: string
  role: LoginLogsRole
}

/** รูปร่างขั้นต่ำของเอกสาร key ที่อ่านมาจาก DB (lean หรือ toObject) */
export interface TokenDocLike {
  _id: unknown
  prefix: string
  holder?: { account_id?: string; email?: string[]; full_name?: string; role?: string } | null
  expiresAt?: Date | null
  revokedAt?: Date | null
  lastUsedAt?: Date | null
  createdAt?: Date | null
  createdBy?: string
  revokedBy?: string
}

/** key ที่ส่งออกทาง API โดยไม่มี hash */
export interface TokenSummary {
  id: string
  prefix: string
  holder: LoginLogsHolder
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string | null
  createdBy: string
  revokedBy: string
}

export interface KeySnapshot {
  key_id: string
  key_prefix: string
  holder: LoginLogsHolder
}

export type LoginLogsAuthOutcome =
  | { ok: true; reason: "ok"; key: KeySnapshot }
  | { ok: false; reason: "revoked" | "expired"; key: KeySnapshot }
  | { ok: false; reason: "missing" | "invalid"; key: null }

export interface AccessLogEntry {
  caller: LoginLogsHolder | null
  key_id: string | null
  key_prefix: string | null
  method: string
  path: string
  query: Record<string, string>
  status_code: number
  result_count: number
  ip: string
  user_agent: string
  duration_ms: number
  requestedAt: Date
  requestedAtTh: string
}

export interface AccessLogFilter {
  account_id?: string
  role?: LoginLogsRole
  from?: string
  to?: string
}

export type ICreateTokenBodyDTO = typeof LoginLogsModel.CreateTokenBody.static
export type IAccessLogQueryDTO = typeof LoginLogsModel.AccessLogQuery.static
