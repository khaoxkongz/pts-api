import { Types, type QueryFilter } from "mongoose"

import { type TUser } from "@/models/user.js"

export function buildUserSearchQuery(q?: string, excludeAccountId?: string, cursor?: string) {
  const match: QueryFilter<TUser> = {}

  if (excludeAccountId) {
    match.accountId = { $ne: excludeAccountId }
  }

  if (cursor) {
    match._id = { $lt: new Types.ObjectId(cursor) }
  }

  if (q) {
    const trimmedQ = q.trim()
    match.$or = [
      { fullNameTh: { $regex: trimmedQ, $options: "i" } },
      { employeeId: { $regex: trimmedQ, $options: "i" } },
    ]
  }

  return match
}
