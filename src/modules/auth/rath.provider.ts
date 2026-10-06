import { InvalidCookieSignature, NotFoundError } from "elysia"

import env from "@/env.js"
import { type RaOneThResponse } from "@/types/ra.js"

export const RaThAuthProvider = {
  async getUserInfo(accountId: string) {
    const method = "POST"
    const headers = {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_ONE_TH_API_KEY}`,
    }
    const body = JSON.stringify({ accountId })
    const init = { method, headers, body }
    const response = await fetch("https://ra.one.th/api/vMonk/externalApi/detailUserByAccountId", init)
    if (!response.ok) throw new InvalidCookieSignature("RA_AUTH")
    const data = (await response.json()) as unknown as RaOneThResponse
    const user = data.result.at(0)
    if (!user) throw new NotFoundError()
    return user
  },
}
