import { UserRA } from "@/models/user-ra.js"

export async function searchUsers(match: Record<string, unknown>, limit: number) {
  return await UserRA.find(match)
    .limit(limit + 1)
    .lean()
}
