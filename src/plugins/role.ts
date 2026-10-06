import { Elysia } from "elysia"

import { resolveSessionUser } from "@/modules/auth/service.js"
import { requestSessionCredentials } from "@/modules/auth/utils.js"

export const roles = new Elysia({ name: "auth.roles" }).macro({
  requireRole: (roles: string[]) => ({
    // Resolves the user itself: one macro's resolve must not depend on another's result.
    resolve: async ({ headers, cookie }) => {
      const resolved = await resolveSessionUser(requestSessionCredentials({ headers, cookie }))

      return { authorized: resolved !== null && roles.includes(resolved.user.role) }
    },
  }),
})
