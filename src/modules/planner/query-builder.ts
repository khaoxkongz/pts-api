import { DateTime } from "luxon"
import { type QueryFilter } from "mongoose"

import type * as PlannerModel from "@/modules/planner/model.js"

import { type TPlanner } from "@/models/planner.js"
import { type TCompanyMember } from "@/models/user.js"

export interface UserContext {
  accountId: string
  companies: TCompanyMember[]
  role: string
  isSupervisor: boolean
}

export function buildBaseAccessConditions(user: UserContext) {
  const baseOrConditions: QueryFilter<TPlanner> = [
    { createdBy: user.accountId },
    {
      "participants.accountId": user.accountId,
      status: { $nin: ["DRAFT"] },
    },
  ]

  return baseOrConditions
}

export function buildStatusFilter(
  status?: (typeof PlannerModel.queriesPlanner.static)["status"]
): QueryFilter<TPlanner> | null {
  if (!status) {
    return null
  }
  if (status === "WAITING") {
    return {
      status: {
        $in: [
          "WAITING_GA_ESTIMATE",
          "WAITING_JV_APPROVAL",
          "WAITING_EMP_SUMMARY",
          "WAITING_GA_ACTUAL_COST",
          "WAITING_CLAIM_ALLOWANCE",
        ],
      },
    }
  } else {
    return { status: { $in: [status] } }
  }
}

export function buildDocumentSearchFilter(searchTerm?: string): Record<string, QueryFilter<TPlanner>> | null {
  if (!searchTerm || searchTerm.trim() === "") {
    return null
  }

  const trimmed = searchTerm.trim()

  return {
    $or: [
      {
        documentId: {
          $regex: trimmed,
          $options: "i",
        },
      },
      {
        name: {
          $regex: trimmed,
          $options: "i",
        },
      },
    ],
  }
}

export function buildDateRangeFilter(from?: string, to?: string) {
  if (!from && !to) {
    return null
  }

  if (from && !to) {
    return {
      "dateRange.from": { $gte: DateTime.fromISO(from, { zone: "Asia/Bangkok" }).toUTC().toJSDate() },
    }
  }

  if (to && !from) {
    return {
      "dateRange.to": { $lte: DateTime.fromISO(to, { zone: "Asia/Bangkok" }).toUTC().toJSDate() },
    }
  }

  if (from && to) {
    return {
      "dateRange.from": { $lte: DateTime.fromISO(to, { zone: "Asia/Bangkok" }).toUTC().toJSDate() },
      "dateRange.to": { $gte: DateTime.fromISO(from, { zone: "Asia/Bangkok" }).toUTC().toJSDate() },
    }
  }

  return null
}

export function buildPlannerListQuery(
  user: UserContext,
  queryParams: typeof PlannerModel.queriesPlanner.static
): QueryFilter<TPlanner> {
  const baseOrConditions = buildBaseAccessConditions(user)

  const conditions: QueryFilter<TPlanner> = [
    {
      $or: baseOrConditions,
    },
  ]

  const statusFilter = buildStatusFilter(queryParams.status)
  if (statusFilter) {
    conditions.push(statusFilter)
  }

  const documentFilter = buildDocumentSearchFilter(queryParams.document)
  if (documentFilter) {
    conditions.push(documentFilter)
  }

  const dateFilter = buildDateRangeFilter(queryParams.from, queryParams.to)
  if (dateFilter) {
    conditions.push(dateFilter)
  }

  return conditions
}

export function buildPlannerDetailQuery(user: UserContext, documentId: string): Record<string, QueryFilter<TPlanner>> {
  const baseOrConditions: QueryFilter<TPlanner> = [
    {
      documentId,
      $or: [
        { createdBy: user.accountId },
        {
          "participants.accountId": user.accountId,
          status: { $nin: ["DRAFT"] },
        },
      ],
    },
  ]

  return {
    $or: baseOrConditions,
  }
}
