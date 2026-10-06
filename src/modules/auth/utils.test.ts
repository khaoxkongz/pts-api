import { describe, expect, it } from "vite-plus/test"

import { createSignedToken, requestSessionCredentials, sessionTokenFrom } from "./utils.js"

const SECRET = "test-session-secret-that-is-long-enough"

describe("session token precedence", () => {
  it("uses the header token when only a header token is sent", () => {
    expect(sessionTokenFrom({ rawToken: "header-token" }, SECRET)).toBe("header-token")
  })

  it("uses the token inside a validly signed cookie when only the cookie is sent", () => {
    const { token, signedToken } = createSignedToken(SECRET)

    expect(sessionTokenFrom({ signedCookie: signedToken }, SECRET)).toBe(token)
  })

  it("prefers the header token over the cookie when both are sent", () => {
    const { signedToken } = createSignedToken(SECRET)

    expect(sessionTokenFrom({ rawToken: "header-token", signedCookie: signedToken }, SECRET)).toBe("header-token")
  })

  it("rejects an empty header token instead of falling back to the cookie", () => {
    const { signedToken } = createSignedToken(SECRET)

    expect(sessionTokenFrom({ rawToken: "", signedCookie: signedToken }, SECRET)).toBeNull()
  })

  it("uses the cookie when no raw token was sent", () => {
    const { token, signedToken } = createSignedToken(SECRET)

    expect(sessionTokenFrom({ rawToken: null, signedCookie: signedToken }, SECRET)).toBe(token)
  })

  it("rejects a cookie signed with another secret", () => {
    const { signedToken } = createSignedToken("another-secret-that-is-also-long-enough")

    expect(sessionTokenFrom({ signedCookie: signedToken }, SECRET)).toBeNull()
  })

  it("rejects a cookie that is not signed at all", () => {
    expect(sessionTokenFrom({ signedCookie: "plain-token" }, SECRET)).toBeNull()
  })

  it("finds no token when neither a header token nor a cookie is sent", () => {
    expect(sessionTokenFrom({}, SECRET)).toBeNull()
    expect(sessionTokenFrom({ rawToken: "", signedCookie: "" }, SECRET)).toBeNull()
  })
})

describe("session credentials of a request", () => {
  it("takes the raw token from x-authorized-token and the signed token from the auth cookie", () => {
    const credentials = requestSessionCredentials({
      headers: { "x-authorized-token": "header-token", authorization: "Bearer bearer-token" },
      cookie: { auth: { value: "token.signature" }, other: { value: "other" } },
    })

    expect(credentials).toEqual({ rawToken: "header-token", signedCookie: "token.signature" })
  })

  it("leaves both empty when the request sends neither", () => {
    expect(requestSessionCredentials({ headers: {}, cookie: {} })).toEqual({
      rawToken: undefined,
      signedCookie: undefined,
    })
  })
})
