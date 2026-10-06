import { DateTime } from "luxon"

import { STATUS, WAITING_STATUSES } from "@/utils/status/status.js"

import { escapeRegex } from "./utils.js"

export interface UserContext {
  userId: string[]
  role: string
  isSupervisor: boolean
  companyName: string[]
}

export interface GaQueryParams {
  page?: number
  pageSize?: number
  status?: string | string[]
  document?: string
  from?: string
  to?: string
}

export type QueryCondition = Record<string, unknown>

/**
 * Build date query condition for MongoDB
 */
export function buildDateQuery(from?: string, to?: string): QueryCondition | null {
  if (!from && !to) {
    return null
  }

  const fromDate = from ? DateTime.fromISO(from, { zone: "Asia/Bangkok" }).toUTC().toJSDate() : undefined
  const toDate = to ? DateTime.fromISO(to, { zone: "Asia/Bangkok" }).toUTC().toJSDate() : undefined
  const dateQuery: QueryCondition = {}

  if (fromDate) {
    dateQuery["$gte"] = fromDate
  }
  if (toDate) {
    dateQuery["$lte"] = toDate
  }

  return dateQuery
}

/**
 * Build status order logic for sorting based on role
 */
export function buildStatusOrderLogic(role: string): QueryCondition {
  if (role === "GA") {
    return {
      $switch: {
        branches: [
          // eslint-disable-next-line unicorn/no-thenable
          { case: { $in: [STATUS.WAITING_GA_ESTIMATE, "$status"] }, then: 1 },
          // eslint-disable-next-line unicorn/no-thenable
          { case: { $in: [STATUS.WAITING_GA_ACTUAL_COST, "$status"] }, then: 2 },
        ],
        default: 3,
      },
    }
  }

  if (role === "GM") {
    return {
      $switch: {
        branches: [
          // eslint-disable-next-line unicorn/no-thenable
          { case: { $in: [STATUS.WAITING_JV_APPROVAL, "$status"] }, then: 1 },
          // eslint-disable-next-line unicorn/no-thenable
          { case: { $in: [STATUS.JV_APPROVED, "$status"] }, then: 2 },
          // eslint-disable-next-line unicorn/no-thenable
          { case: { $in: [STATUS.JV_REJECTED, "$status"] }, then: 3 },
        ],
        default: 4,
      },
    }
  }

  return {}
}

/**
 * Build base match conditions based on user role and subordinates
 */
export function buildGaBaseMatch(user: UserContext, subordinateIds: string[] = []): QueryCondition[] {
  const baseMatch: QueryCondition[] = [{ status: { $nin: [STATUS.DRAFT] } }]

  const permissionConditions: QueryCondition[] = []

  if (
    user.isSupervisor &&
    user.role !== "GA" &&
    user.role !== "SUPERADMIN" &&
    user.role !== "PLANNER" &&
    user.role !== "FINANCE"
  ) {
    permissionConditions.push({
      $or: [{ createdByEmployeeId: { $in: subordinateIds } }, { "participants.employeeId": { $in: subordinateIds } }],
    })
  }

  if (user.role === "GM") {
    permissionConditions.push({
      $or: [
        {
          jvs: {
            $elemMatch: {
              companyFullNameTh: { $in: user.companyName },
            },
          },
        },
      ],
    })
  }

  if (permissionConditions.length > 0) {
    baseMatch.push({ $or: permissionConditions })
  }

  return baseMatch
}

/**
 * Build data match conditions based on query params
 */
export function buildGaDataMatch(baseMatch: QueryCondition[], query: GaQueryParams): QueryCondition[] {
  const dataMatch = [...baseMatch]

  // Status filter
  if (query.status && query.status !== "ALL") {
    if (query.status === "WAITING") {
      dataMatch.push({ status: { $in: WAITING_STATUSES } })
    } else {
      const statusValue = Array.isArray(query.status) ? { $in: query.status } : query.status
      dataMatch.push({ status: statusValue })
    }
  }

  // Document search
  if (query.document) {
    const keyword = escapeRegex(query.document.trim())
    dataMatch.push({
      $or: [{ documentId: { $regex: keyword, $options: "i" } }, { name: { $regex: keyword, $options: "i" } }],
    })
  }

  // Date range
  const dateQuery = buildDateQuery(query.from, query.to)
  if (dateQuery?.$gte || dateQuery?.$lte) {
    const match: any = {}

    if (dateQuery.$lte) {
      match["dateRange.from"] = { $lte: dateQuery.$lte }
    }

    if (dateQuery.$gte) {
      match["dateRange.to"] = { $gte: dateQuery.$gte }
    }
    dataMatch.push(match)
  }

  return dataMatch
}

/**
 * Combine base and data matches into final query objects
 */
export function buildGaQueryMatches(user: UserContext, query: GaQueryParams, subordinateIds: string[] = []) {
  const baseMatch = buildGaBaseMatch(user, subordinateIds)
  const dataMatch = buildGaDataMatch(baseMatch, query)

  return {
    finalBaseMatch: baseMatch.length > 0 ? { $and: baseMatch } : {},
    finalDataMatch: dataMatch.length > 0 ? { $and: dataMatch } : {},
  }
}
