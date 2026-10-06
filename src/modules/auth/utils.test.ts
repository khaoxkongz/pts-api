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

describe("session token precedence on the notification stream (opted in to ?token=)", () => {
  it("uses the x-authorized-token header", () => {
    const credentials = requestSessionCredentials({
      headers: { "x-authorized-token": "header-token" },
      cookie: {},
      queryToken: undefined,
    })

    expect(sessionTokenFrom(credentials, SECRET)).toBe("header-token")
  })

  it("uses the ?token= query token when no header is sent, since EventSource cannot send headers", () => {
    const credentials = requestSessionCredentials({ headers: {}, cookie: {}, queryToken: "query-token" })

    expect(sessionTokenFrom(credentials, SECRET)).toBe("query-token")
  })

  it("prefers the header over the ?token= query token when both are sent", () => {
    const credentials = requestSessionCredentials({
      headers: { "x-authorized-token": "header-token" },
      cookie: {},
      queryToken: "query-token",
    })

    expect(sessionTokenFrom(credentials, SECRET)).toBe("header-token")
  })

  it("keeps an empty header instead of falling back to the ?token= query token or the cookie", () => {
    const { signedToken } = createSignedToken(SECRET)
    const credentials = requestSessionCredentials({
      headers: { "x-authorized-token": "" },
      cookie: { auth: { value: signedToken } },
      queryToken: "query-token",
    })

    expect(sessionTokenFrom(credentials, SECRET)).toBeNull()
  })

  it("uses the signed cookie when neither a header nor a query token is sent", () => {
    const { token, signedToken } = createSignedToken(SECRET)
    const credentials = requestSessionCredentials({
      headers: {},
      cookie: { auth: { value: signedToken } },
      queryToken: undefined,
    })

    expect(sessionTokenFrom(credentials, SECRET)).toBe(token)
  })

  it("does not accept an Authorization: Bearer token", () => {
    const credentials = requestSessionCredentials({
      headers: { authorization: "Bearer bearer-token" },
      cookie: {},
      queryToken: undefined,
    })

    expect(sessionTokenFrom(credentials, SECRET)).toBeNull()
  })
})

describe("session token precedence on routes not opted in to ?token=", () => {
  it("ignores a token query parameter and keeps using the cookie", () => {
    const { token, signedToken } = createSignedToken(SECRET)
    // Shaped like a route context: the query is there, but no queryToken is passed.
    const request = { headers: {}, cookie: { auth: { value: signedToken } }, query: { token: "query-token" } }

    expect(sessionTokenFrom(requestSessionCredentials(request), SECRET)).toBe(token)
    expect(sessionTokenFrom(requestSessionCredentials({ ...request, cookie: {} }), SECRET)).toBeNull()
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
