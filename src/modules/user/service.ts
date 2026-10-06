import { User, type TUser } from "@/models/user.js"

import { getUserSubordinatesByLeaderId } from "./provider.js"
import { buildUserSearchQuery } from "./query-builder.js"
import { searchUsers as searchUsersFromStore } from "./store.js"

export async function searchUsers(q?: string, excludeAccountId?: string, cursor?: string, limit = 10) {
  const match = buildUserSearchQuery(q, excludeAccountId, cursor)

  const users = await searchUsersFromStore(match, limit)

  const hasNextPage = users.length > limit
  const data = hasNextPage ? users.slice(0, -1) : users
  const nextId = hasNextPage ? data.at(-1)?._id : null

  return {
    nextId,
    users: data.map((user) => ({
      ...user,
    })),
  }
}

export async function addUsers(users: TUser[]) {
  await Promise.all(
    users.map(async (user) => {
      const employeeIds = user.companies?.flatMap((c) => c.employeeId ?? []) ?? []

      if (employeeIds.length > 0) {
        for (const empId of employeeIds) {
          const members = await getUserSubordinatesByLeaderId(empId)
          if (members?.length) {
            user.isSupervisor = true
            break
          }
        }
      }

      return User.insertOne(user)
    })
  )
}
