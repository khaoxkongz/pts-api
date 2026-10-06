import { type SessionTokenVerifier } from "../../adapters/auth/session-token-verifier.js"
import { type PushHub } from "../../core/ports/push-hub.port.js"
import { type StreamAuth } from "../../core/ports/stream-auth.port.js"

export interface StreamAuthServiceDeps {
  streamAuth: StreamAuth
  sessionTokenVerifier: SessionTokenVerifier
  pushHub: PushHub
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

      const token = deps.sessionTokenVerifier.verify(params.signedToken)
      if (!token) {
        return null
      }

      const session = await deps.streamAuth.findSessionByToken(token)
      if (!session) {
        return null
      }
      return await deps.streamAuth.findUserByAccountId(session.userId)
    },

    createStreamResponse(accountId: string) {
      return deps.pushHub.createStreamResponse(accountId)
    },
  }
}
