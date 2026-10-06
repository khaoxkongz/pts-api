import { constantTimeEqual, isShareToken, sha256Hex, shareTokenPrefixOf } from "./crypto.js"
import { toHolder } from "./logic.js"
import * as TokenStore from "./token-store.js"
import { type KeySnapshot, type LoginLogsAuthOutcome, type TokenDocLike } from "./type.js"

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) {
    return null
  }

  const [scheme, ...rest] = authorization.split(" ")

  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null
  }

  return rest.join(" ").trim() || null
}

function toSnapshot(doc: TokenDocLike): KeySnapshot {
  return {
    key_id: String(doc._id),
    key_prefix: doc.prefix,
    holder: toHolder(doc.holder),
  }
}

/** key มีอยู่จริงแล้ว เหลือตรวจว่าถูกเพิกถอนหรือหมดอายุหรือยัง */
function evaluate(doc: TokenDocLike): LoginLogsAuthOutcome {
  const key = toSnapshot(doc)

  if (doc.revokedAt) {
    return { ok: false, reason: "revoked", key }
  }

  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired", key }
  }

  TokenStore.touchLastUsed(key.key_id)

  return { ok: true, reason: "ok", key }
}

async function authenticateShare(token: string): Promise<LoginLogsAuthOutcome> {
  const candidates = await TokenStore.findByPrefix(shareTokenPrefixOf(token))
  const tokenHash = sha256Hex(token)
  const matched = candidates.find((candidate) => constantTimeEqual(tokenHash, candidate.tokenHash))

  if (!matched) {
    return { ok: false, reason: "missing", key: null }
  }

  return evaluate(matched)
}

/** รับเฉพาะ share key (ขึ้นต้น ptsll_) token รูปแบบอื่นถือว่าไม่ถูกต้อง */
export async function authenticateBearer(authorization: string | undefined): Promise<LoginLogsAuthOutcome> {
  const token = extractBearer(authorization)

  if (!token) {
    return { ok: false, reason: "missing", key: null }
  }

  if (!isShareToken(token)) {
    return { ok: false, reason: "invalid", key: null }
  }

  return await authenticateShare(token)
}
