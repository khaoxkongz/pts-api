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
