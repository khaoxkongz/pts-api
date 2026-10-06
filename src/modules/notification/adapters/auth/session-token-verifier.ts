import { verifySignedToken } from "@/modules/auth/utils.js"

export interface SessionTokenVerifier {
  verify(signedToken: string): string | null
}

export class HmacSessionTokenVerifier implements SessionTokenVerifier {
  constructor(private readonly secret: string) {}

  verify(signedToken: string) {
    return verifySignedToken(signedToken, this.secret)
  }
}
