import { t } from "elysia"

export const roles = t.Union([
  t.Literal("EMPLOYEE"),
  t.Literal("GM"),
  t.Literal("GA"),
  t.Literal("PLANNER"),
  t.Literal("FINANCE"),
  t.Literal("SUPERADMIN"),
  t.Literal("SUPERVISOR"),
])

export const queryFilters = t.Object({
  role: t.Union([roles], { default: "EMPLOYEE" }),
  from: t.Optional(t.String({ format: "date" })),
  to: t.Optional(t.String({ format: "date" })),
  year: t.Optional(t.String()),
  JV: t.Optional(t.String()),
})

export const actualCostCategory = t.Union([
  t.Literal("booth_fee"),
  t.Literal("airfare"),
  t.Literal("accommodation"),
  t.Literal("car_rental"),
  t.Literal("ferry_fare"),
  t.Literal("allowance"),
  t.Literal("other"),
])

export const actualCostSummaryQuery = t.Object({
  role: t.Union([roles], { default: "EMPLOYEE" }),
  from: t.Optional(t.String({ format: "date" })),
  to: t.Optional(t.String({ format: "date" })),
  year: t.Optional(t.String()),
  JV: t.Optional(t.String()),
  sort: t.Union([t.Literal("desc"), t.Literal("asc")], { default: "desc" }),
  type: t.Optional(actualCostCategory),
  page: t.Optional(t.Number({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 10 })),
})

export const filterYearsQuery = t.Object({
  role: t.Union([roles], { default: "EMPLOYEE" }),
  JV: t.Optional(t.String()),
})

// ── F1: Yearly Worthy Donut Chart ───────────────────────────────────────────
export const worthinessCategory = t.Union([
  t.Literal("WORTHY"),
  t.Literal("MODERATE"),
  t.Literal("NOT_WORTHY"),
  t.Literal("UNANALYZED"),
  t.Literal("OTHER"),
])

export const summaryQuery = queryFilters

export const detailsQuery = t.Composite([
  queryFilters,
  t.Object({
    category: worthinessCategory,
  }),
])

// ── F2: Monthly Worthy Bar Chart ───────────────────────────────────────────
export const monthlyWorthyQuery = queryFilters

// ── F3: Top Onsite Locations — Widget ─────────────────────────────────────
export const topLocationsQuery = t.Composite([
  queryFilters,
  t.Object({
    page: t.Number({ minimum: 1, default: 1 }),
    pageSize: t.Number({ minimum: 1, maximum: 100, default: 10 }),
  }),
])

// ── F3: Top Onsite Locations — Modal ──────────────────────────────────────
export const locationPlansQuery = t.Composite([
  queryFilters,
  t.Object({
    page: t.Number({ minimum: 1, default: 1 }),
    pageSize: t.Number({ minimum: 1, maximum: 100, default: 10 }),
    locationName: t.String({ minLength: 1 }),
  }),
])

// ── F4: Top JV Actual Cost — Widget ───────────────────────────────────────
export const topJvCostsQuery = t.Composite([
  queryFilters,
  t.Object({
    page: t.Number({ minimum: 1, default: 1 }),
    pageSize: t.Number({ minimum: 1, maximum: 100, default: 10 }),
  }),
])

// ── F4: Top JV Actual Cost — Modal ────────────────────────────────────────
export const jvPlansQuery = t.Composite([
  queryFilters,
  t.Object({
    page: t.Number({ minimum: 1, default: 1 }),
    pageSize: t.Number({ minimum: 1, maximum: 100, default: 10 }),
    sort: t.Union([t.Literal("desc"), t.Literal("asc")], { default: "desc" }),
    companyName: t.String({ minLength: 1, description: "ชื่อบริษัทกิจการร่วมค้า (Joint Venture)" }),
  }),
])
