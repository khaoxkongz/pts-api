import { DateTime } from "luxon"

import { CompanyJV } from "@/models/employee-ra.js"
import { Planner } from "@/models/planner.js"
import { User } from "@/models/user.js"
import { STATUS } from "@/utils/status/status.js"

import { DASHBOARD_CATEGORY_LABELS } from "./constants.js"
import * as QueryBuilder from "./query-builder.js"
import * as Store from "./store.js"
import * as Type from "./type.js"
import * as DashboardUtils from "./utils.js"

export async function getAllNumberOfPlans(query: Type.IDashboardFilterInput, userContext: Type.RbacUserContext) {
  try {
    const queryArgs: Type.TQueryFilters = {
      ...query,
      year: query.year,
      role: userContext.effectiveRole,
    }

    const matchAgrs = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)
    QueryBuilder.buildDataMatchNumberOfPlans(matchAgrs)
    const facetResult = await Store.getAllNumberOfPlans(matchAgrs)

    const statusStats = (facetResult?.byStatus ?? []) as {
      _id: string
      count: number
    }[]

    return {
      total: facetResult?.total?.[0]?.count ?? 0,

      waitingGaEstimate: DashboardUtils.getStatusCount(statusStats, STATUS.WAITING_GA_ESTIMATE),
      waitingGaActualCost: DashboardUtils.getStatusCount(statusStats, STATUS.WAITING_GA_ACTUAL_COST),
      waitingJVApproval: DashboardUtils.getStatusCount(statusStats, STATUS.WAITING_JV_APPROVAL),
      jvApproved: DashboardUtils.getStatusCount(statusStats, STATUS.JV_APPROVED),
      jvRejected: DashboardUtils.getStatusCount(statusStats, STATUS.JV_REJECTED),
      waitingEmpSummary: DashboardUtils.getStatusCount(statusStats, STATUS.WAITING_EMP_SUMMARY),
      waitingClaimAllowance: DashboardUtils.getStatusCount(statusStats, STATUS.WAITING_CLAIM_ALLOWANCE),
      completed: DashboardUtils.getStatusCount(statusStats, STATUS.GA_COMPLETED),
      cancelled: DashboardUtils.getStatusCount(statusStats, STATUS.CANCELLED),
    }
  } catch (error) {
    console.error("Error in getAllNumberOfPlans:", error)
    throw error
  }
}

export async function getActualCostSummary(
  query: Type.IDashboardActualCostSummaryInput,
  userContext: Type.RbacUserContext
) {
  try {
    const queryArgs: Type.TQueryFilters = {
      ...query,
      year: query.year,
      role: userContext.effectiveRole,
    }

    const matchArgs = await QueryBuilder.buildDataMatchActualCostSummary(queryArgs, userContext)

    const facetResult = await Store.getActualCostSummary(matchArgs, query.sort)

    const summaryMap = new Map(
      (facetResult?.typeSummary ?? []).map((item: { _id: string; totalActualCost: number }) => [
        item._id,
        Number(item.totalActualCost ?? 0),
      ])
    )

    const rankings: Type.CostTypeSummary[] = Object.entries(Type.DashboardTypeMap)
      .map(([key, label]) => ({
        key,
        label,
        value: Number(summaryMap.get(label) ?? 0),
      }))
      .toSorted((a: Type.CostTypeSummary, b: Type.CostTypeSummary) =>
        query.sort === "asc" ? a.value - b.value : b.value - a.value
      )

    return {
      typeSummary: rankings,
      grandTotal: Number(facetResult?.grandTotal ?? 0),
    }
  } catch (error) {
    console.error("Error in getActualCostSummary:", error)
    throw error
  }
}

export async function getActualCostByType(
  query: Type.IDashboardActualCostSummaryInput,
  userContext: Type.RbacUserContext
) {
  try {
    const queryArgs: Type.TQueryFilters = {
      ...query,
      year: query.year,
      role: userContext.effectiveRole,
    }

    const matchAgrs = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)

    const typeTh = query.type ? Type.DashboardTypeMap[query.type] || query.type : ""

    const facetResult = await Store.getActualCostByType(matchAgrs, typeTh, query.sort, query.page, query.limit)

    return {
      total: facetResult?.total ?? 0,
      totalCount: facetResult?.totalCount ?? 0,
      totalPage: Math.ceil((facetResult?.totalCount ?? 0) / (query.limit ?? 10)),
      totalPerPlan: facetResult?.plans ?? [],
    }
  } catch (error) {
    console.error("Error in getActualCostPerPlan:", error)
    throw error
  }
}

export async function getActualCostGraphData(
  query: Type.IDashboardActualCostSummaryInput,
  userContext: Type.RbacUserContext
) {
  try {
    const queryArgs: Type.TQueryFilters = {
      ...query,
      year: query.year,
      role: userContext.effectiveRole,
    }

    const dataMatch = await QueryBuilder.buildDataMatchActualCostGraph(queryArgs, userContext)

    const summary: Type.GraphActualCostData[] = (await Store.getActualCostGraphData(
      dataMatch
    )) as Type.GraphActualCostData[]

    return buildMonths(summary, query)
  } catch (error) {
    console.error("Error in getActualCostGraphData:", error)
    throw error
  }
}

export async function getActualCostPerPlan(
  query: Type.IDashboardActualCostSummaryInput,
  userContext: Type.RbacUserContext
) {
  const queryArgs: Type.TQueryFilters = {
    ...query,
    year: query.year,
    role: userContext.effectiveRole,
  }

  const matchAgrs = await QueryBuilder.buildDataMatchActualCostSummary(queryArgs, userContext)

  const {
    total = 0,
    totalCount = 0,
    plans = [],
  } = await Store.getActualCostPerPlan(matchAgrs, query.sort, query.page, query.limit)

  const limit = query.limit ?? 10

  return {
    total,
    totalCount,
    totalPage: Math.ceil(totalCount / limit),
    totalPerPlan: plans,
  }
}

export async function getActualCostPerPlanByType(documentId: string, sort: "asc" | "desc" = "desc") {
  const dataMatch = QueryBuilder.buildDataMatchActualCostPerPlanByType(documentId)

  const facetResult = await Store.getActualCostPerPlanByType(dataMatch, sort)

  const summaryMap = new Map(
    (facetResult?.typeSummary ?? []).map((item: { key: string; value: number }) => [item.key, Number(item.value ?? 0)])
  )

  const rankings: Type.CostTypeSummary[] = Object.entries(Type.DashboardTypeMap)
    .map(([key, label]) => ({
      key,
      label,
      value: Number(summaryMap.get(label) ?? 0),
    }))
    .toSorted((a: Type.CostTypeSummary, b: Type.CostTypeSummary) =>
      sort === "asc" ? a.value - b.value : b.value - a.value
    )

  const document = await Planner.findOne({ documentId }, { _id: 0, documentId: 1, name: 1 }).lean()

  return {
    document: document,
    grandTotal: Number(facetResult?.grandTotal ?? 0),
    typeSummary: rankings,
  }
}

export async function getCompanyJVDropdown(accountId?: string, role?: string, search?: string) {
  let companyTaxIds: string[] | undefined

  if (accountId) {
    const employee = await User.findOne({ accountId }).lean()
    if (!employee) {
      return []
    }

    companyTaxIds = [...new Set(employee.companies.map((c) => c.companyTaxId))]

    if (role === "GM" && employee.gmCompany?.length) {
      const jvs = await CompanyJV.find({
        $or: employee.gmCompany.map((name) => ({
          companyFullNameTh: { $in: [name] },
        })),
      }).lean()

      companyTaxIds = [...new Set(jvs.map((jv) => jv.taxId))]
    }
  }

  const dataMatch = QueryBuilder.buildDataMatchCompanyDropdown(companyTaxIds)

  const result = await Store.getCompanyJVDropdown(dataMatch, search)

  return result.map((item) => ({
    companyFullNameTh: item.companyFullNameTh,
    companyTaxId: item.taxId,
  }))
}

export async function getDashboardGraphFilterYears(query: Type.TQueryYears, userContext: Type.RbacUserContext) {
  const accessMatch = await QueryBuilder.buildDashboardAccessMatch(query, userContext)

  const [donut, bar, actual] = await Promise.all([
    Store.getYearsByMatch(accessMatch, {
      "worthiness.worthiness": { $exists: true, $ne: null },
    }),
    Store.getYearsByMatch(accessMatch, {
      "worthiness.worthiness": "คุ้มค่า",
    }),
    Store.getYearsByMatch(accessMatch, {
      "actualBudget.price": { $exists: true, $gt: 0 },
    }),
  ])

  return {
    worthinessDonut: donut,
    worthinessBar: bar,
    actualBudgetBar: actual,
  }
}

//helper functions
function buildMonths(summary: Type.GraphActualCostData[], query: Type.IDashboardActualCostSummaryInput) {
  const map = new Map(summary.map((i) => [`${i.year}-${i.month}`, i.totalActualCost]))

  const result = []

  // CASE 1: filter year
  if (query.year) {
    const { year } = query

    for (let m = 1; m <= 12; m += 1) {
      const key = `${year}-${m}`

      result.push({
        year,
        month: m,
        monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
        totalActualCost: map.get(key) ?? 0,
      })
    }

    return result
  }

  const from = DateTime.fromISO(query.from ?? "")
  const to = DateTime.fromISO(query.to ?? "")

  // CASE 2: from-to ปีเดียว
  if (from.year === to.year) {
    const { year } = from

    const previousMonths: any[] = []

    for (const [key, value] of map.entries()) {
      const [y, m] = key.split("-").map(Number)

      if (y !== undefined && y < from.year) {
        previousMonths.push({
          year: y,
          month: m,
          monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
          totalActualCost: value,
        })
      }
    }

    // เรียงเดือนเก่าให้ถูก
    previousMonths.sort(
      (a, b) =>
        DateTime.fromObject({ year: a.year, month: a.month }).toMillis() -
        DateTime.fromObject({ year: b.year, month: b.month }).toMillis()
    )

    result.push(...previousMonths)

    for (let m = 1; m <= 12; m += 1) {
      const key = `${year}-${m}`

      if ((m >= from.month || map.has(key)) && m <= to.month) {
        result.push({
          year,
          month: m,
          monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
          totalActualCost: map.get(key) ?? 0,
        })
      } else {
        result.push({
          year,
          month: m,
          monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
          totalActualCost: 0,
        })
      }
    }

    return result
  }

  const firstYear = from.year

  // STEP 1: เอาเดือนที่เก่ากว่า ม.ค. ปีแรก ติดมาแสดงก่อน
  const previousMonths: any[] = []

  for (const [key, value] of map.entries()) {
    const [y, m] = key.split("-").map(Number)

    if (y !== undefined && y < firstYear) {
      previousMonths.push({
        year: y,
        month: m,
        monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
        totalActualCost: value,
      })
    }
  }

  previousMonths.sort(
    (a, b) =>
      DateTime.fromObject({ year: a.year, month: a.month }).toMillis() -
      DateTime.fromObject({ year: b.year, month: b.month }).toMillis()
  )

  result.push(...previousMonths)

  // STEP 2: เริ่มปีแรกที่ ม.ค. เสมอ
  let cursor = DateTime.fromObject({ year: firstYear, month: 1 })
  const end = DateTime.fromObject({ year: to.year, month: to.month })

  while (cursor <= end) {
    const key = `${cursor.year}-${cursor.month}`

    result.push({
      year: cursor.year,
      month: cursor.month,
      monthLabel: DateTime.fromObject({ month: cursor.month }).setLocale("th").toFormat("LLL"),
      totalActualCost: map.get(key) ?? 0,
    })

    cursor = cursor.plus({ months: 1 })
  }

  return result
}

// ════════════════════════════════════════════════════════════════════
// F1 —
// ════════════════════════════════════════════════════════════════════

// ── Helper: Date Normalization สำหรับ F1 และ F2 ─────────────────────────────────
export function normalizeDashboardDates(query: Type.TQueryFilters) {
  let startDate: DateTime
  let endDate: DateTime
  let responseYear: number | undefined

  const year = Number.parseInt(query.year ?? "", 10)

  if (query.from && query.to) {
    startDate = DateTime.fromISO(query.from).startOf("month")
    endDate = DateTime.fromISO(query.to).startOf("month")
  } else if (query.year) {
    startDate = DateTime.fromObject({ year, month: 1, day: 1 }).startOf("month")
    endDate = DateTime.fromObject({ year, month: 12, day: 31 }).startOf("month")
    responseYear = year

    query.from = startDate.toISODate() ?? ""
    query.to = endDate.endOf("month").toISODate() ?? ""
  } else {
    const currentYear = DateTime.now().year
    startDate = DateTime.fromObject({ year: currentYear, month: 1, day: 1 }).startOf("month")
    endDate = DateTime.fromObject({ year: currentYear, month: 12, day: 31 }).startOf("month")
    responseYear = currentYear

    query.from = startDate.toISODate() ?? ""
    query.to = endDate.endOf("month").toISODate() ?? ""
  }

  return { startDate, endDate, responseYear }
}

export async function getDashboardSummary(
  query: Type.TSummaryQuery,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardSummaryResponse> {
  const { responseYear } = normalizeDashboardDates(query)
  const matchAgrs = await QueryBuilder.buildCoreDashboardMatch(query, userContext)

  const summary = await Store.aggregateDashboardSummary(matchAgrs)

  return {
    year: responseYear ?? 0,
    totalPlans: summary.totalPlans,
    categories: summary.categories,
    defaultCategoryKey: summary.defaultCategoryKey,
  }
}

export async function getDashboardDetails(
  query: Type.TDetailsQuery,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardDetailsResponse> {
  const { responseYear } = normalizeDashboardDates(query)
  const matchAgrs = await QueryBuilder.buildCoreDashboardMatch(query, userContext)

  const details = await Store.aggregateDashboardDetails(matchAgrs, query.category)
  const items = details.selectedItems.map((item, index) => ({
    rank: index + 1,
    name: item.name,
    documentId: item.documentId,
  }))

  return {
    year: responseYear ?? 0,
    category: details.selectedCategory ?? {
      key: query.category,
      label: DASHBOARD_CATEGORY_LABELS[query.category],
      count: 0,
      percent: 0,
    },
    items,
  }
}

// ════════════════════════════════════════════════════════════════════
// F2 — Monthly Worthy Bar Chart
// ════════════════════════════════════════════════════════════════════

export async function getDashboardMonthlyWorthy(
  query: Type.TQueryFilters,
  userContext: Type.RbacUserContext
): Promise<Type.MonthlyWorthyItem[]> {
  const queryArgs: Type.TQueryFilters = {
    ...query,
    role: userContext.effectiveRole,
  }

  // ② สร้าง base match (ครอบคลุม RBAC, JV และ DateRange เรียบร้อยแล้ว)
  const dataMatch = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)

  // ③ ดึงข้อมูลจาก Database (ส่งแค่ dataMatch เพราะวันที่โดนกรองมาตั้งแต่ Query Builder แล้ว)
  const dbResult: Type.MonthlyWorthyAggregation[] = await Store.aggregateDashboardMonthlyWorthy(dataMatch)

  const months = buildMonthlyWorthyMonths(dbResult, queryArgs)

  return months
}

function buildMonthlyWorthyMonths(
  dbResult: Type.MonthlyWorthyAggregation[],
  query: Type.TQueryFilters
): Type.MonthlyWorthyItem[] {
  const map = new Map(dbResult.map((r) => [`${r._id.year}-${r._id.month}`, r.count]))

  const result: Type.MonthlyWorthyItem[] = []

  const pushMonth = (year: number, month: number, count?: number) => {
    const key = `${year}-${month}`

    result.push({
      year,
      month,
      monthLabel: DateTime.fromObject({ month }).setLocale("th").toFormat("LLL"),
      count: count ?? map.get(key) ?? 0,
    })
  }

  // CASE 1: filter year
  if (query.year) {
    const year = Number(query.year)
    for (let m = 1; m <= 12; m += 1) {
      pushMonth(year, m)
    }
    return result
  }

  const from = DateTime.fromISO(query.from ?? "")
  const to = DateTime.fromISO(query.to ?? "")

  // CASE 2: from-to ปีเดียวกัน
  if (from.year === to.year) {
    const year = from.year

    // STEP A: เอาเดือนของ "ปีก่อนหน้า" ที่ db ติดมา
    const previousMonths: Type.MonthlyWorthyItem[] = []

    for (const [key, value] of map.entries()) {
      const [y, m] = key.split("-").map(Number)

      if (y !== undefined && m !== undefined && y < year) {
        previousMonths.push({
          year: y,
          month: m,
          monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
          count: value,
        })
      }
    }

    // เรียงให้ถูกต้อง
    previousMonths.sort(
      (a, b) =>
        DateTime.fromObject({ year: a.year, month: a.month }).toMillis() -
        DateTime.fromObject({ year: b.year, month: b.month }).toMillis()
    )

    result.push(...previousMonths)

    // STEP B: แสดงทั้ง 12 เดือนของปีที่ query (ไม่มี = 0)
    for (let m = 1; m <= 12; m += 1) {
      pushMonth(year, m)
    }

    return result
  }

  // CASE 3: cross year
  const firstYear = from.year
  const end = DateTime.fromObject({ year: to.year, month: to.month })

  const previousMonths: Type.MonthlyWorthyItem[] = []

  for (const [key, value] of map.entries()) {
    const [y, m] = key.split("-").map(Number)

    if (y !== undefined && m !== undefined && y < firstYear) {
      previousMonths.push({
        year: y,
        month: m,
        monthLabel: DateTime.fromObject({ month: m }).setLocale("th").toFormat("LLL"),
        count: value,
      })
    }
  }

  previousMonths.sort(
    (a, b) =>
      DateTime.fromObject({ year: a.year, month: a.month }).toMillis() -
      DateTime.fromObject({ year: b.year, month: b.month }).toMillis()
  )

  result.push(...previousMonths)

  let cursor = DateTime.fromObject({ year: firstYear, month: 1 })

  while (cursor <= end) {
    pushMonth(cursor.year, cursor.month)
    cursor = cursor.plus({ months: 1 })
  }

  return result
}

// ════════════════════════════════════════════════════════════════════
// F3 — Top Onsite Locations
// ════════════════════════════════════════════════════════════════════

export async function getDashboardTopLocations(
  query: Type.ITopLocationsQueryFilters,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardTopLocationsResponse> {
  // ① กำหนดค่า Pagination เริ่มต้น
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 5

  const queryArgs: Type.TQueryFilters = {
    ...query,
    role: userContext.effectiveRole,
  }

  // ② สร้างเงื่อนไขการกรองข้อมูล (RBAC + Date Range + JV)
  const dataMatch = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)

  // ③ เรียกดึงข้อมูล Aggregate สรุป Top Locations จาก Database
  const { items, total } = await Store.aggregateTopLocations(dataMatch, page, pageSize)

  // ④ คำนวณจำนวนหน้าทั้งหมด และค่าออฟเซ็ตสำหรับจัดอันดับ (Rank) ข้ามหน้า
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const globalRankOffset = (page - 1) * pageSize

  // ⑤ จัดรูปแบบข้อมูลและรันลำดับอันดับให้ถูกต้อง
  const locations: Type.TopLocationItem[] = items.map((item, i) => ({
    rank: globalRankOffset + i + 1,
    name: item.locationName,
    count: item.count,
  }))

  return { pagination: { page, pageSize, total, totalPages }, locations }
}

export async function getDashboardLocationPlans(
  query: Type.ILocationPlansQueryFilters,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardLocationPlansResponse> {
  // ① กำหนดค่า Pagination เริ่มต้น
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 10

  const queryArgs: Type.TQueryFilters = {
    ...query,
    role: userContext.effectiveRole,
  }

  // ② สร้างเงื่อนไขการกรองข้อมูลแบบเดียวกันกับหน้าหลัก
  const dataMatch = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)

  // ③ เรียกดึงข้อมูลรายการแผนงานตามสถานที่ (Drill-down) จาก Database
  const { total, selectedPlans } = await Store.aggregateLocationPlans(dataMatch, query.locationName, page, pageSize)

  // ④ คำนวณจำนวนหน้าทั้งหมด
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0

  // ⑤ คำนวณลำดับที่ (Sequence/Index) เพื่อให้รันเลขต่อเนื่องเวลาเปลี่ยนหน้า
  const globalRankOffset = (page - 1) * pageSize

  // ⑥ แมปข้อมูลแผนงานและใส่ลำดับ (Rank) ให้ต่อเนื่อง
  const plans: Type.LocationPlanItem[] = selectedPlans.map((plan, i) => ({
    rank: globalRankOffset + i + 1,
    name: plan.name,
    documentId: plan.documentId,
  }))

  // ⑦ จัดโครงสร้าง Response ให้เป็นรูปแบบ Drill-down พร้อมใช้งานสำหรับ Frontend
  return {
    pagination: { page, pageSize, total, totalPages },
    selectedLocation: {
      name: query.locationName,
      count: total,
      plans,
    },
  }
}

// ════════════════════════════════════════════════════════════════════
// F4 — Top JV Actual Cost
// ════════════════════════════════════════════════════════════════════

export async function getDashboardTopJvCosts(
  query: Type.ITopJvCostsQueryFilters,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardTopJvCostsResponse> {
  // ① กำหนดค่า Pagination เริ่มต้น
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 5

  const queryArgs: Type.TQueryFilters = {
    ...query,
    role: userContext.effectiveRole,
  }

  // ② สร้างเงื่อนไขการกรองข้อมูล (RBAC + Date Range + JV)
  const match = await QueryBuilder.buildCoreDashboardMatch(queryArgs, userContext)

  // ③ เรียกข้อมูลและยอดรวมจาก Database (total ในที่นี้คือจำนวนบริษัททั้งหมด)
  const { items, total } = await Store.aggregateTopJvCosts(match, page, pageSize, -1)

  // ④ คำนวณจำนวนหน้าทั้งหมด และค่าออฟเซ็ตสำหรับจัดอันดับ (Rank) ข้ามหน้า
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const globalRankOffset = (page - 1) * pageSize

  // ⑤ จัดรูปแบบข้อมูลและรันลำดับอันดับให้ถูกต้อง
  const jvs: Type.TopJvCostItem[] = items.map((item, i) => ({
    rank: globalRankOffset + i + 1,
    companyName: item.companyName,
    totalActualCost: item.totalActualCost,
  }))

  // ⑥ คืนค่าข้อมูลสำหรับ Dashboard
  return {
    pagination: { page, pageSize, total, totalPages },
    jvs,
  }
}

export async function getDashboardJvPlans(
  query: Type.IJvPlansQueryFilters,
  userContext: Type.RbacUserContext
): Promise<Type.DashboardJvPlansResponse> {
  // ① กำหนดค่า Pagination และการเรียงลำดับ
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 10
  const sort = query.sort ?? "desc"
  const sortDirection = sort === "asc" ? 1 : -1

  const queryMatch: Type.TQueryFilters = {
    ...query,
    role: userContext.effectiveRole,
  }

  // ② สร้างเงื่อนไขการกรองข้อมูล
  const match = await QueryBuilder.buildCoreDashboardMatch(queryMatch, userContext)

  // ③ ดึงข้อมูลแบบ Drill-down (ค้นหาแผนงานทั้งหมดที่บริษัทนี้มีส่วนร่วม)
  const raw = await Store.aggregateJvPlans(match, query.companyName, page, pageSize, sortDirection)

  // ④ แปลงค่าจาก Result (total คือจำนวนแผนงาน, totalActualCost คือยอดรวมของบริษัทนี้)
  const total = raw.total[0]?.count ?? 0
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0
  const totalActualCost = raw.selectedJv[0]?.totalActualCost ?? 0

  // ⑤ คำนวณลำดับที่ (Rank) ให้รันต่อเนื่อง
  const globalRankOffset = (page - 1) * pageSize
  const plans: Type.JvPlanItem[] = raw.plans.map((item, i) => ({
    rank: globalRankOffset + i + 1,
    name: item.name,
    documentId: item._id,
    actualExpenseRatio: item.actualExpenseRatio,
  }))

  // ⑥ คืนค่าโครงสร้างแบบ Drill-down พร้อมใช้งาน
  return {
    selectedJv: {
      companyName: query.companyName,
      totalActualCost,
    },
    pagination: { page, pageSize, total, totalPages },
    sort,
    plans,
  }
}
