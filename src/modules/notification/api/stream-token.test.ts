import { describe, expect, it } from "vite-plus/test"

import { streamRawToken } from "./stream-token.js"

describe("notification stream token", () => {
  it("uses the x-authorized-token header", () => {
    expect(streamRawToken({ "x-authorized-token": "header-token" }, {})).toBe("header-token")
  })

  it("falls back to the ?token= query parameter, since EventSource cannot send headers", () => {
    expect(streamRawToken({}, { token: "query-token" })).toBe("query-token")
  })

  it("prefers the header over ?token= when both are sent", () => {
    expect(streamRawToken({ "x-authorized-token": "header-token" }, { token: "query-token" })).toBe("header-token")
  })

  it("does not accept an Authorization: Bearer token", () => {
    expect(streamRawToken({ authorization: "Bearer bearer-token" }, {})).toBeNull()
  })
})
