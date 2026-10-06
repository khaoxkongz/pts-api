import { Elysia } from "elysia"

import { Session } from "@/models/session.js"
import { User } from "@/models/user.js"
import * as AuthService from "@/modules/auth/service.js"
import { verifySignedToken } from "@/modules/auth/utils.js"

export const session = new Elysia({ name: "auth.session" }).macro({
  isAuth: {
    resolve: async ({ cookie }) => {
      const signedToken = cookie.auth?.value as string | undefined

      if (!signedToken) {
        return {
          session: null,
          user: null,
        }
      }

      const config = AuthService.SESSION_CONFIG

      const token = verifySignedToken(signedToken, config.secret)

      if (!token) {
        return {
          session: null,
          user: null,
        }
      }

      try {
        const session = await Session.findOne({
          token,
          expiresIn: { $gt: new Date() },
        }).lean()

        if (!session) {
          return {
            session: null,
            user: null,
          }
        }

        const user = await User.findOne({
          accountId: session.userId,
        }).lean()

        if (!user) {
          return {
            session: null,
            user: null,
          }
        }

        return {
          session,
          user,
        }
      } catch {
        return {
          session: null,
          user: null,
        }
      }
    },
  },
  isAuthWithToken: {
    resolve: async ({ headers }) => {
      const token = headers["x-authorized-token"]

      if (!token) {
        return {
          session: null,
          user: null,
        }
      }

      try {
        const session = await Session.findOne({
          token,
          expiresIn: { $gt: new Date() },
        }).lean()

        if (!session) {
          return {
            session: null,
            user: null,
          }
        }

        const user = await User.findOne({
          accountId: session.userId,
        }).lean()

        if (!user) {
          return {
            session: null,
            user: null,
          }
        }

        return {
          session,
          user,
        }
      } catch {
        return {
          session: null,
          user: null,
        }
      }
    },
  },
})
