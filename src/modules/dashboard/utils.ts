import * as UserProvider from "@/modules/user/provider.js"
import { type MemberType } from "@/modules/user/type.js"
import { userSubordinatesCache } from "@/plugins/cache.js"

export function getStatusCount(statusStats: unknown[], targetStatus: string) {
  let totalCount = 0
  for (const s of statusStats as { _id: string | string[]; count: number }[]) {
    if (Array.isArray(s._id) ? s._id.includes(targetStatus) : s._id === targetStatus) {
      totalCount += s.count
    }
  }
  return totalCount
}

export async function getSubordinateIds(userId: string) {
  const cacheKey = `subordinates_${userId}`
  const cached = userSubordinatesCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const subordinates: MemberType[] = await UserProvider.getUserSubordinatesByLeaderId(userId)
  const subordinateIds = subordinates.map((s) => s.employeeId)
  userSubordinatesCache.set(cacheKey, subordinateIds)
  return subordinateIds
}

export function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
