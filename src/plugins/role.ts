import { Elysia } from "elysia"

import { Session } from "@/models/session.js"
import { User } from "@/models/user.js"

export const roles = new Elysia({ name: "auth.roles" }).macro({
  requireRole: (roles: string[]) => ({
    resolve: async ({ headers }) => {
      const token = headers["x-authorized-token"]
      if (!token) {
        return {
          authorized: false,
        }
      }

      const session = await Session.findOne({
        token,
        expiresIn: { $gt: new Date() },
      })

      if (!session) {
        return {
          authorized: false,
        }
      }

      const user = await User.findOne({
        accountId: session.userId,
      })

      if (!user) {
        return {
          authorized: false,
        }
      }

      if (!roles.includes(user.role)) {
        return {
          authorized: false,
        }
      }

      return { authorized: true }
    },
  }),
})
