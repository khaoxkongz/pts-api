import { escapeRegex } from "./utils.js"

export interface RoleQueryParams {
  page?: number
  pageSize?: number
  users?: string
  role?: string
}

export type QueryCondition = Record<string, unknown>

export function buildRoleBaseMatch() {
  const baseMatch: QueryCondition[] = [{ role: { $ne: "EMPLOYEE" } }]

  return baseMatch
}

export function buildRoleDataMatch(baseMatch: QueryCondition[], query: RoleQueryParams) {
  const dataMatch: QueryCondition[] = [...baseMatch]

  if (query.users) {
    const keyword = escapeRegex(query.users)
    dataMatch.push({
      $or: [
        { "companies.employeeId": { $regex: keyword, $options: "i" } },
        { fullName: { $regex: keyword, $options: "i" } },
      ],
    })
  }

  if (query.role) {
    dataMatch.push({ role: query.role })
  }

  return dataMatch
}

export function buildRoleQueryMatches(query: RoleQueryParams) {
  const baseMatch = buildRoleBaseMatch()
  const dataMatch = buildRoleDataMatch(baseMatch, query)
  return {
    finalBaseMatch: baseMatch.length > 0 ? { $and: baseMatch } : {},
    finalDataMatch: dataMatch.length > 0 ? { $and: dataMatch } : {},
  }
}
