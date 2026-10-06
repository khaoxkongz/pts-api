import { createHmac, randomBytes } from "node:crypto"

// ==================== Helper Functions ====================

/**
 * สร้าง session token แบบ random (32 characters)
 */
function generateSessionToken(): string {
  return randomBytes(16).toString("hex")
}

/**
 * สร้าง signature จาก token + secret
 */
function signToken(token: string, secret: string): string {
  // ใช้ base64url เพื่อความปลอดภัยใน cookie
  return createHmac("sha256", secret).update(token).digest("base64url")
}

/**
 * ตรวจสอบว่า signed token ถูกต้องหรือไม่
 */
export function verifySignedToken(signedToken: string, secret: string): string | null {
  const [token, signature] = signedToken.split(".")

  if (!token || !signature) {
    return null
  }

  const expectedSignature = signToken(token, secret)

  // ป้องกัน timing attack ด้วย crypto.timingSafeEqual
  const receivedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (receivedBuffer.length !== expectedBuffer.length || !receivedBuffer.equals(expectedBuffer)) {
    return null
  }

  return token
}

export interface SessionCredentials {
  rawToken?: string | null
  signedCookie?: string | null
}

// The raw token is the x-authorized-token header when sent (even when empty). Only a route that passes
// queryToken (the notification stream, since a browser EventSource cannot send headers) falls back to
// ?token=; every other route ignores it, so session tokens stay out of URLs (ADR-0001).
export function requestSessionCredentials(request: {
  headers: Record<string, string | undefined>
  cookie: Record<string, { value?: unknown } | undefined>
  queryToken?: string | undefined
}): SessionCredentials {
  return {
    rawToken: request.headers["x-authorized-token"] ?? request.queryToken,
    signedCookie: request.cookie.auth?.value as string | undefined,
  }
}

// A sent raw (header) token wins over the signed cookie, with no fallback, even when it is empty (ADR-0001).
export function sessionTokenFrom(credentials: SessionCredentials, secret: string): string | null {
  if (typeof credentials.rawToken === "string") {
    return credentials.rawToken || null
  }

  if (!credentials.signedCookie) {
    return null
  }

  return verifySignedToken(credentials.signedCookie, secret)
}

/**
 * สร้าง signed token (token.signature)
 */
export function createSignedToken(secret: string): {
  token: string
  signedToken: string
} {
  const token = generateSessionToken()
  const signature = signToken(token, secret)
  const signedToken = `${token}.${signature}`

  return { token, signedToken }
}
