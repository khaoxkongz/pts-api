import { DateTime } from "luxon"
import { type QueryFilter } from "mongoose"

import { type TPlanner } from "@/models/planner.js"

import { type IQueriyExportPlanner } from "./type.js"

function buildSearchCondition(filter: IQueriyExportPlanner): QueryFilter<TPlanner>[] {
  const conditions: QueryFilter<TPlanner>[] = []

  if (filter.q) {
    conditions.push({ name: { $regex: filter.q, $options: "i" } })
  }

  return conditions
}

function buildDocumentConditions(filter: IQueriyExportPlanner): QueryFilter<TPlanner>[] {
  const conditions: QueryFilter<TPlanner>[] = []
  if ((filter.documentId?.length || 0) > 0) {
    conditions.push({ documentId: { $in: filter.documentId } })
  }
  if ((filter.excludeDocumentId?.length || 0) > 0) {
    conditions.push({ documentId: { $nin: filter.excludeDocumentId } })
  }
  return conditions
}

function buildStatusCondition(filter: IQueriyExportPlanner): QueryFilter<TPlanner> | null {
  if (!filter.status || filter.status.length === 0) {
    return null
  }
  return { status: { $in: filter.status } }
}

function buildDateConditions(filter: IQueriyExportPlanner): QueryFilter<TPlanner>[] {
  if (filter.from && filter.to) {
    const from = DateTime.fromISO(filter.from, { zone: "Asia/Bangkok" }).toUTC().toJSDate()
    const to = DateTime.fromISO(filter.to, { zone: "Asia/Bangkok" }).endOf("day").toUTC().toJSDate()
    return [
      {
        "dateRange.from": { $gte: from },
        "dateRange.to": { $lte: to },
      },
    ]
  }
  const conditions: QueryFilter<TPlanner>[] = []
  if (filter.from) {
    const from = DateTime.fromISO(filter.from, { zone: "Asia/Bangkok" }).toUTC().toJSDate()
    conditions.push({ "dateRange.from": { $gte: from } })
  }
  if (filter.to) {
    const to = DateTime.fromISO(filter.to, { zone: "Asia/Bangkok" }).endOf("day").toUTC().toJSDate()
    conditions.push({ "dateRange.to": { $lte: to } })
  }
  return conditions
}

/**
 * Build MongoDB filter from export query params
 */
export function buildExportQuery(filter: IQueriyExportPlanner): QueryFilter<TPlanner> {
  const conditions: QueryFilter<TPlanner>[] = [
    ...buildDocumentConditions(filter),
    ...buildDateConditions(filter),
    ...buildSearchCondition(filter),
  ]

  const statusCondition = buildStatusCondition(filter)
  if (statusCondition) {
    conditions.push(statusCondition)
  }

  return conditions.length === 0 ? {} : { $and: conditions }
}
