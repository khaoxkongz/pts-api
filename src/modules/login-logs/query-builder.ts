import { DateTime } from "luxon"

import { LOGIN_LOGS_TIME_ZONE } from "./format-date.js"
import { type AccessLogFilter } from "./type.js"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** ตีความวันที่ตามเวลาไทย ถ้าส่งมาเป็นวันที่ล้วนให้ขยายเป็นต้นวัน/ปลายวัน */
function parseBoundary(value: string, edge: "start" | "end"): Date | null {
  const dt = DateTime.fromISO(value, { zone: LOGIN_LOGS_TIME_ZONE })

  if (!dt.isValid) {
    return null
  }

  if (!DATE_ONLY.test(value)) {
    return dt.toJSDate()
  }

  return edge === "start" ? dt.startOf("day").toJSDate() : dt.endOf("day").toJSDate()
}

export function buildAccessLogQuery(filter: AccessLogFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {}

  if (filter.account_id) {
    match["caller.account_id"] = filter.account_id
  }

  if (filter.role) {
    match["caller.role"] = filter.role
  }

  const requestedAt: { $gte?: Date; $lte?: Date } = {}
  const from = filter.from ? parseBoundary(filter.from, "start") : null
  const to = filter.to ? parseBoundary(filter.to, "end") : null

  if (from) {
    requestedAt.$gte = from
  }

  if (to) {
    requestedAt.$lte = to
  }

  if (Object.keys(requestedAt).length > 0) {
    match.requestedAt = requestedAt
  }

  return match
}
