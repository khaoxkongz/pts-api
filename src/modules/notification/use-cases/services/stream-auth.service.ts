import { verifySignedToken } from "@/modules/auth/utils.js"

import { type StreamAuth } from "../../core/ports/stream-auth.port.js"

export interface StreamAuthServiceDeps {
  streamAuth: StreamAuth
  sessionSecret: string
}

export function streamAuthService(deps: StreamAuthServiceDeps) {
  return {
    async resolveUser(params: { rawToken?: string | null; signedToken?: string | null }) {
      if (params.rawToken) {
        const session = await deps.streamAuth.findSessionByToken(params.rawToken)
        if (!session) {
          return null
        }
        return await deps.streamAuth.findUserByAccountId(session.userId)
      }

      if (!params.signedToken) {
        return null
      }

      const token = verifySignedToken(params.signedToken, deps.sessionSecret)
      if (!token) {
        return null
      }

      const session = await deps.streamAuth.findSessionByToken(token)
      if (!session) {
        return null
      }
      return await deps.streamAuth.findUserByAccountId(session.userId)
    },
  }
}
