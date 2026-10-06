import { User } from "@/models/user.js"

import { generateShareToken } from "./crypto.js"
import { toTokenSummary } from "./logic.js"
import * as TokenStore from "./token-store.js"
import { type ICreateTokenBodyDTO, type LoginLogsHolder, type TokenSummary } from "./type.js"

const MS_PER_DAY = 24 * 60 * 60 * 1000

type ResolveHolderResult =
  | { ok: true; holder: LoginLogsHolder }
  | { ok: false; reason: "missing-holder" | "user-not-found" }

/**
 * ผูก key กับเจ้าของตั้งแต่ตอนสร้าง
 * ส่ง account_id มาจะดึงอีเมลและชื่อจาก collection user ไม่งั้นต้องกรอก holderName เอง
 */
async function resolveHolder(body: ICreateTokenBodyDTO): Promise<ResolveHolderResult> {
  if (body.account_id) {
    const user = await User.findOne(
      { accountId: body.account_id },
      { accountId: 1, email: 1, emailOneId: 1, fullName: 1 }
    ).lean()

    if (!user) {
      return { ok: false, reason: "user-not-found" }
    }

    return {
      ok: true,
      holder: {
        account_id: String(user.accountId),
        email: [user.email, user.emailOneId].filter((value): value is string => Boolean(value)),
        full_name: user.fullName ?? "",
        role: body.role,
      },
    }
  }

  if (!body.holderName) {
    return { ok: false, reason: "missing-holder" }
  }

  return {
    ok: true,
    holder: {
      account_id: "",
      email: body.holderEmail ? [body.holderEmail] : [],
      full_name: body.holderName,
      role: body.role,
    },
  }
}

export async function createToken(
  body: ICreateTokenBodyDTO,
  createdBy: string
): Promise<
  { ok: true; token: string; key: TokenSummary } | { ok: false; reason: "missing-holder" | "user-not-found" }
> {
  const resolved = await resolveHolder(body)

  if (!resolved.ok) {
    return resolved
  }

  const { token, prefix, tokenHash } = generateShareToken()
  const created = await TokenStore.createToken({
    holder: resolved.holder,
    tokenHash,
    prefix,
    expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * MS_PER_DAY) : null,
    createdBy,
  })

  // plaintext token คืนครั้งเดียวตรงนี้เท่านั้น ระบบเก็บแค่ hash
  return { ok: true, token, key: toTokenSummary(created) }
}

export async function listTokens(): Promise<TokenSummary[]> {
  const tokens = await TokenStore.listTokens()

  return tokens.map(toTokenSummary)
}

export async function revokeToken(
  id: string,
  revokedBy: string
): Promise<{ ok: true; key: TokenSummary } | { ok: false }> {
  const revoked = await TokenStore.revokeById(id, revokedBy)

  if (revoked) {
    return { ok: true, key: toTokenSummary(revoked) }
  }

  // ไม่ได้อัปเดตแปลว่าไม่มี key นี้ หรือถูกเพิกถอนไปก่อนแล้ว
  const existing = await TokenStore.findById(id)

  return existing ? { ok: true, key: toTokenSummary(existing) } : { ok: false }
}
