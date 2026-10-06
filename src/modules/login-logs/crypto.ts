import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** ptsll = planner-tag-system + login-logs ให้เห็น key ที่หลุดออกไปแล้วรู้ทันทีว่าเป็นของระบบไหน */
export const SHARE_TOKEN_PREFIX = "ptsll_"

/** ความยาวของส่วนที่เก็บไว้ระบุตัวตน: prefix + 8 ตัวแรกของ secret */
const SHARE_TOKEN_PREFIX_LENGTH = SHARE_TOKEN_PREFIX.length + 8

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

/** เทียบสตริงแบบ constant-time ป้องกัน timing attack */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

export function isShareToken(token: string): boolean {
  return token.startsWith(SHARE_TOKEN_PREFIX)
}

export function shareTokenPrefixOf(token: string): string {
  return token.slice(0, SHARE_TOKEN_PREFIX_LENGTH)
}

/** สร้าง share key ใหม่ คืน plaintext ให้แสดงครั้งเดียว ระบบเก็บแค่ hash */
export function generateShareToken(): { token: string; prefix: string; tokenHash: string } {
  const token = `${SHARE_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`

  return {
    token,
    prefix: shareTokenPrefixOf(token),
    tokenHash: sha256Hex(token),
  }
}
