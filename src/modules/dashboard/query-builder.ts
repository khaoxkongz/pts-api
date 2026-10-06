import { DateTime } from "luxon"
import { type QueryFilter } from "mongoose"

import { type TPlanner } from "@/models/planner.js"

import { buildRbacMatch } from "./permission.js"
import { type RbacUserContext, type TQueryFilters, type TQueryYears } from "./type.js"

export type QueryCondition = Record<string, unknown>

export function buildDateRangeFilter(
  startDate?: string,
  endDate?: string,
  isYearFilter = false
): QueryFilter<TPlanner> | null {
  if (!startDate && !endDate) {
    return null
  }

  const $and: QueryFilter<TPlanner>[] = []

  if (isYearFilter) {
    // Mode: Start Date in Year — สำหรับกรองตามปี (Year)
    // แผนงานจะถูกจัดให้อยู่ในปีนั้นๆ โดยดูจาก "วันที่เริ่มต้น" (dateRange.from)
    if (startDate) {
      const startUTC = DateTime.fromISO(startDate, { zone: "Asia/Bangkok" }).startOf("day").toUTC().toJSDate()
      $and.push({ "dateRange.from": { $gte: startUTC } })
    }
    if (endDate) {
      const endUTC = DateTime.fromISO(endDate, { zone: "Asia/Bangkok" }).endOf("day").toUTC().toJSDate()
      $and.push({ "dateRange.from": { $lte: endUTC } })
    }
  } else {
    // Mode: Overlap Logic — สำหรับกรองตามช่วงวันที่ (From-To)
    // ขอแค่มีส่วนใดส่วนหนึ่งทับซ้อนกับช่วงที่เลือก (เริ่ม <= วันจบ และ จบ >= วันเริ่ม)
    if (endDate) {
      const endUTC = DateTime.fromISO(endDate, { zone: "Asia/Bangkok" }).endOf("day").toUTC().toJSDate()
      $and.push({ "dateRange.from": { $lte: endUTC } })
    }
    if (startDate) {
      const startUTC = DateTime.fromISO(startDate, { zone: "Asia/Bangkok" }).startOf("day").toUTC().toJSDate()
      $and.push({ "dateRange.to": { $gte: startUTC } })
    }
  }

  return $and.length ? { $and: $and } : null
}

export async function buildDataMatchActualCostSummary(query: TQueryFilters, user: RbacUserContext) {
  const dataMatch = await buildCoreDashboardMatch(query, user)
  if (dataMatch) {
    dataMatch.status = {
      $in: ["GA_COMPLETED", "COMPLETED", "WAITING_PLANNER_COST_ANALYSIS"],
    }
  }
  return dataMatch
}

export async function buildDataMatchActualCostGraph(query: TQueryFilters, user: RbacUserContext) {
  const dataMatch = await buildCoreDashboardMatch(query, user)
  if (dataMatch) {
    dataMatch.status = {
      $in: ["GA_COMPLETED", "COMPLETED", "WAITING_PLANNER_COST_ANALYSIS"],
    }
  }
  if (query.year) {
    const year = Number.parseInt(query.year, 10)

    const startOfYear = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: "Asia/Bangkok" })
      .startOf("day")
      .toUTC()
      .toJSDate()
    const endOfYear = DateTime.fromObject({ year, month: 12, day: 31 }, { zone: "Asia/Bangkok" })
      .endOf("day")
      .toUTC()
      .toJSDate()
    dataMatch.$and = [
      ...(Array.isArray(dataMatch.$and) ? dataMatch.$and : []),
      {
        "dateRange.from": { $lte: endOfYear },
        "dateRange.to": { $gte: startOfYear },
      },
    ]
  }
  return dataMatch
}

export function buildDataMatchActualCostPerPlanByType(documentId: string) {
  const dataMatch: QueryCondition = {
    documentId: documentId,
    status: {
      $in: ["GA_COMPLETED", "COMPLETED", "WAITING_PLANNER_COST_ANALYSIS"],
    },
  }

  return dataMatch
}

export function buildDataMatchCompanyDropdown(companyTaxIds?: string[]) {
  const dataMatch: QueryCondition = {}

  if (companyTaxIds) {
    dataMatch.$and = [
      {
        companyFullNameTh: {
          $nin: ["บริษัท อินเทอร์เน็ตประเทศไทย จำกัด (มหาชน)"],
        },
      },
      {
        taxId: { $in: companyTaxIds },
      },
    ]
  } else {
    dataMatch.companyFullNameTh = {
      $nin: ["บริษัท อินเทอร์เน็ตประเทศไทย จำกัด (มหาชน)"],
    }
  }

  return dataMatch
}

export function buildDataMatchNumberOfPlans(dataMatch: QueryFilter<TPlanner>) {
  dataMatch.status = { $nin: ["DRAFT"] }
}

export function buildJvFilter(jv?: string): QueryFilter<TPlanner> | null {
  if (!jv || jv === "" || jv === "ALL") {
    return null
  }
  return { "jvs.companyFullNameTh": jv }
}

// export function buildGMRbacMatch(user: RbacUserContext): QueryFilter<TPlanner> | null {
//   if (user.role !== "GM") {
//     return null
//   }

//   return { "jvs.companyFullNameTh": { $in: user.companies } }
// }

export async function buildCoreDashboardMatch(
  query: TQueryFilters,
  user: RbacUserContext
): Promise<QueryFilter<TPlanner>> {
  const and: QueryFilter<TPlanner>[] = []
  let orConditions: QueryFilter<TPlanner>[] = []

  if (query.role === "EMPLOYEE") {
    const rbacFilter = await buildRbacMatch(user)

    if (rbacFilter?.$or) {
      orConditions = [...(rbacFilter.$or as QueryFilter<TPlanner>[])]
    } else if (Object.keys(rbacFilter).length > 0) {
      and.push(rbacFilter)
    }
  }

  if (query.role === "GM") {
    if (!query.JV || query.JV === "ALL") {
      const gmCompanyNames = user.gmCompany.filter((name) => name !== "บริษัท อินเทอร์เน็ตประเทศไทย จำกัด (มหาชน)")

      orConditions.push({
        "jvs.companyFullNameTh": { $in: gmCompanyNames },
      })
    } else {
      const jvFilter = buildJvFilter(query.JV)
      if (jvFilter) {
        orConditions.push(jvFilter as QueryFilter<TPlanner>)
      }
    }
  } else if (query.role !== "EMPLOYEE") {
    const jvFilter = buildJvFilter(query.JV)
    if (jvFilter) {
      orConditions.push(jvFilter as QueryFilter<TPlanner>)
    }
  }

  if (orConditions.length > 0) {
    and.push({ $or: orConditions })
  }

  if (query.from || query.to) {
    const isYearFilter = !!query.year
    const dateFilter = buildDateRangeFilter(query.from, query.to, isYearFilter)
    if (dateFilter) {
      and.push(dateFilter)
    }
  }

  const dataMatch: QueryFilter<TPlanner> = {
    status: { $in: ["GA_COMPLETED", "WAITING_PLANNER_COST_ANALYSIS", "COMPLETED"] },
  }

  if (and.length > 0) {
    dataMatch.$and = and
  }

  return dataMatch
}

export async function buildDashboardAccessMatch(
  query: TQueryYears,
  user: RbacUserContext
): Promise<QueryFilter<TPlanner>> {
  const and: QueryFilter<TPlanner>[] = []
  let orConditions: QueryFilter<TPlanner>[] = []

  if (query.role === "EMPLOYEE") {
    const rbacFilter = await buildRbacMatch(user)

    if (rbacFilter?.$or) {
      orConditions = [...(rbacFilter.$or as QueryFilter<TPlanner>[])]
    } else if (Object.keys(rbacFilter).length > 0) {
      and.push(rbacFilter)
    }
  }

  if (query.role === "GM") {
    if (!query.JV || query.JV === "ALL") {
      const gmCompanyNames = user.gmCompany.filter((name) => name !== "บริษัท อินเทอร์เน็ตประเทศไทย จำกัด (มหาชน)")

      orConditions.push({
        "jvs.companyFullNameTh": { $in: gmCompanyNames },
      })
    } else {
      const jvFilter = buildJvFilter(query.JV)
      if (jvFilter) orConditions.push(jvFilter)
    }
  } else if (query.role !== "EMPLOYEE") {
    const jvFilter = buildJvFilter(query.JV)
    if (jvFilter) orConditions.push(jvFilter)
  }

  if (orConditions.length > 0) {
    and.push({ $or: orConditions })
  }

  return and.length > 0 ? { $and: and } : {}
}
