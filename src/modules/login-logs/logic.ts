import { type LoginLogsHolder, type TokenDocLike, type TokenSummary } from "./type.js"

function toIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

export function toHolder(holder: TokenDocLike["holder"]): LoginLogsHolder {
  return {
    account_id: holder?.account_id ?? "",
    email: holder?.email ?? [],
    full_name: holder?.full_name ?? "",
    role: holder?.role ?? "",
  }
}

/** แปลงเอกสาร key เป็นรูปแบบที่ส่งออกได้ ไม่มี tokenHash ติดไปด้วย */
export function toTokenSummary(doc: TokenDocLike): TokenSummary {
  return {
    id: String(doc._id),
    prefix: doc.prefix,
    holder: toHolder(doc.holder),
    expiresAt: toIso(doc.expiresAt),
    revokedAt: toIso(doc.revokedAt),
    lastUsedAt: toIso(doc.lastUsedAt),
    createdAt: toIso(doc.createdAt),
    createdBy: doc.createdBy ?? "",
    revokedBy: doc.revokedBy ?? "",
  }
}

/** แปลง query object ของ request ให้เป็น Record<string, string> สำหรับเก็บลง log */
export function toQueryRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [key, String(item)])
  )
}

/**
 * srvx (ตัวที่ @elysiajs/node ใช้) แนบ ip ของ connection มากับ request
 * แต่ Request มาตรฐานไม่มี field นี้ จึงต้องตรวจก่อนอ่าน
 */
function connectionIp(request: Request): string | undefined {
  return "ip" in request && typeof request.ip === "string" ? request.ip : undefined
}

/** ใช้ x-forwarded-for ตัวแรกถ้ามี ไม่งั้นใช้ ip ของ connection */
export function resolveIp(forwardedFor: string | undefined, request: Request): string {
  return forwardedFor?.split(",")[0]?.trim() || connectionIp(request) || ""
}
