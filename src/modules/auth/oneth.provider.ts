import { InvalidCookieSignature } from "elysia"

import env from "@/env.js"
import { type OneThAuth } from "@/types/one.js"

export const OneThAuthProvider = {
  async getUserInfo(code: string): Promise<OneThAuth> {
    const method = "POST"
    const headers = { accept: "application/json", "Content-Type": "application/json" }
    const body = JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.ONE_TH_AUTH_CLIENT_ID,
      client_secret: env.ONE_TH_AUTH_CLIENT_SECRET,
      code: code,
      redirect_uri: "",
    })
    const init = { method, headers, body }
    const response = await fetch("https://one.th/oauth/token", init)
    if (!response.ok) throw new InvalidCookieSignature("ONE_AUTH")
    const data = (await response.json()) as unknown as OneThAuth
    return Promise.resolve<OneThAuth>(data)
  },
  async getUserInfoWithSharedToken(sharedToken: string): Promise<OneThAuth> {
    const method = "POST"
    const headers = { accept: "application/json", "Content-Type": "application/json" }
    const body = JSON.stringify({
      client_id: env.ONE_TH_AUTH_CLIENT_ID,
      client_secret: env.ONE_TH_AUTH_CLIENT_SECRET,
      shared_token: sharedToken,
      refcode: "",
    })
    const init = { method, headers, body }
    const response = await fetch("https://one.th/api/oauth/shared-token", init)
    if (!response.ok) throw new InvalidCookieSignature("ONE_AUTH")
    const data = (await response.json()) as unknown as OneThAuth
    return Promise.resolve<OneThAuth>(data)
  },
}
