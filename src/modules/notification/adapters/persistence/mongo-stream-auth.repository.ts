import { Session } from "@/models/session.js"
import { User } from "@/models/user.js"

import { type StreamAuth } from "../../core/ports/stream-auth.port.js"

export const MongoStreamAuthRepository: StreamAuth = {
  async findSessionByToken(token: string) {
    const session = await Session.findOne({
      token,
      expiresIn: { $gt: new Date() },
    }).lean()

    if (!session) {
      return null
    }
    return { userId: session.userId }
  },

  async findUserByAccountId(accountId: string) {
    const user = await User.findOne({ accountId }).lean()
    if (!user) {
      return null
    }
    return { accountId: user.accountId }
  },
}
