import { LoginLogsAccessLog } from "@/models/login-logs-access-log.js"

import { type AccessLogEntry } from "./type.js"

/**
 * เขียน log แบบไม่รอผล คืน void เพื่อไม่ให้ call site เผลอ await จนทำให้ response ช้า
 * ถ้าเขียนไม่สำเร็จให้ log ไว้แล้วปล่อยผ่าน ห้ามทำให้ request หลักพัง
 */
export function recordAccessLog(entry: AccessLogEntry): void {
  void LoginLogsAccessLog.create(entry).catch((error: unknown) => {
    console.error("[login-logs] บันทึก access log ไม่สำเร็จ", error)
  })
}

export async function findAccessLogs(match: Record<string, unknown>, page: number, limit: number) {
  try {
    const [items, total] = await Promise.all([
      LoginLogsAccessLog.find(match)
        .sort({ requestedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LoginLogsAccessLog.countDocuments(match),
    ])

    return { items, total }
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการดึงข้อมูล access logs", { cause: error })
  }
}
