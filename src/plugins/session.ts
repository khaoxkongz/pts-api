import { Elysia } from "elysia"

import { resolveSessionUser } from "@/modules/auth/service.js"

/**
 * One login macro: the x-authorized-token header first, then the signed `auth`
 * cookie (ADR-0001). Handlers get the full session and user, or null for both.
 */
export const session = new Elysia({ name: "auth.session" }).macro({
  isAuth: {
    resolve: async ({ headers, cookie }) => {
      const resolved = await resolveSessionUser({
        rawToken: headers["x-authorized-token"],
        signedCookie: cookie.auth?.value as string | undefined,
      })

      return resolved ?? { session: null, user: null }
    },
  },
})
