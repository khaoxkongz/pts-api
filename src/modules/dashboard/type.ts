import * as Model from "./model.js"

export interface IDashboardFilterInput {
  role: string
  from?: string
  to?: string
  JV?: string
  year?: string
}

export interface IDashboardActualCostSummaryInput {
  role: string
  from?: string
  to?: string
  year?: string
  JV?: string
  sort: "asc" | "desc"
  type?: string
  page?: number
  limit?: number
}

export interface GraphActualCostData {
  year: number
  month: number
  totalActualCost: number
}

export interface CostTypeSummary {
  key: string
  label: string
  value: number
}

export const DashboardTypeMap: Record<string, string> = {
  booth_fee: "ค่าบูท",
  airfare: "ค่าตั๋วเครื่องบิน",
  accommodation: "ค่าที่พัก",
  car_rental: "ค่าเช่ารถ",
  ferry_fare: "ค่าตั๋วเรือ",
  allowance: "ค่าเบี้ยเลี้ยง",
  other: "อื่นๆ",
}

export const DashboardTypeReverseMap = Object.fromEntries(
  Object.entries(DashboardTypeMap).map(([k, v]) => [v, k])
) as Record<(typeof DashboardTypeMap)[keyof typeof DashboardTypeMap], keyof typeof DashboardTypeMap>

export type GraphYears = {
  worthinessDonut: string[]
  worthinessBar: string[]
  actualBudgetBar: string[]
}

// ── F1: Yearly Worthy Donus Chart ───────────────────────────────────────────
export type TRole = typeof Model.roles.static
export type TQueryFilters = typeof Model.queryFilters.static
export type TWorthinessCategory = typeof Model.worthinessCategory.static
export type TSummaryQuery = typeof Model.summaryQuery.static
export type TDetailsQuery = typeof Model.detailsQuery.static
export type TQueryYears = typeof Model.filterYearsQuery.static

export interface DashboardCategoryMetric {
  key: TWorthinessCategory
  label: string
  count: number
  percent: number
}

export interface DashboardDetailsItem {
  name: string
  documentId: string
}

export interface DashboardDetailsRankedItem extends DashboardDetailsItem {
  rank: number
}

export interface DashboardSummaryMetrics {
  totalPlans: number
  categories: DashboardCategoryMetric[]
  defaultCategoryKey: TWorthinessCategory
}

export interface DashboardDetailsMetrics extends DashboardSummaryMetrics {
  selectedItems: DashboardDetailsItem[]
  selectedCategory: DashboardCategoryMetric
}

export interface DashboardSummaryResponse {
  year: number
  totalPlans: number
  categories: DashboardCategoryMetric[]
  defaultCategoryKey: TWorthinessCategory
}

export interface DashboardDetailsResponse {
  year: number
  category: DashboardCategoryMetric
  items: DashboardDetailsRankedItem[]
}

// ── F2: Monthly Worthy Bar Chart ───────────────────────────────────────────
export interface MonthlyWorthyItem {
  year: number
  month: number
  monthLabel: string
  count: number
}

export interface MonthlyWorthyAggregation {
  _id: {
    year: number
    month: number
  }
  count: number
}

// ── F3: Top Onsite Locations ───────────────────────────────────────────────
export type ITopLocationsQueryFilters = typeof Model.topLocationsQuery.static
export type ILocationPlansQueryFilters = typeof Model.locationPlansQuery.static

export interface TopLocationItem {
  rank: number
  name: string
  count: number
}

export interface LocationPlanItem {
  rank: number
  name: string
  documentId: string
}

export interface LocationPaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface DashboardTopLocationsResponse {
  pagination: LocationPaginationMeta
  locations: TopLocationItem[]
}

export interface DashboardLocationPlansResponse {
  pagination: LocationPaginationMeta
  selectedLocation: {
    name: string
    count: number
    plans: LocationPlanItem[]
  }
}

// ── F4: Top JV Actual Cost ─────────────────────────────────────────────────
export type ITopJvCostsQueryFilters = typeof Model.topJvCostsQuery.static
export type IJvPlansQueryFilters = typeof Model.jvPlansQuery.static

export interface TopJvCostItem {
  rank: number
  companyName: string
  totalActualCost: number
}

export interface JvPlanItem {
  rank: number
  name: string
  documentId: string
  actualExpenseRatio: number
}

export interface JvPlanPaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface DashboardTopJvCostsResponse {
  pagination: JvPlanPaginationMeta
  jvs: TopJvCostItem[]
}

export interface DashboardJvPlansResponse {
  selectedJv: {
    companyName: string
    totalActualCost: number
  }
  pagination: JvPlanPaginationMeta
  sort: "desc" | "asc"
  plans: JvPlanItem[]
}

export interface RbacUserContext {
  employeeId: string[]
  role: TRole
  effectiveRole: TRole
  isSupervisor: boolean
  companies: string[]
  gmCompany: string[]
}
