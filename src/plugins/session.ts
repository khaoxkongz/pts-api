import { Elysia } from "elysia"

import { resolveSessionUser } from "@/modules/auth/service.js"
import { requestSessionCredentials } from "@/modules/auth/utils.js"

export const session = new Elysia({ name: "auth.session" }).macro({
  isAuth: {
    resolve: async ({ headers, cookie }) => {
      const resolved = await resolveSessionUser(requestSessionCredentials({ headers, cookie }))

      return resolved ?? { session: null, user: null }
    },
  },
})
