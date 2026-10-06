import { Elysia, t } from "elysia"

import { session } from "@/plugins/session.js"

import * as Model from "./model.js"
import { applyJvPermission, validateViewAsRole } from "./permission.js"
import * as Service from "./service.js"

export const dashboard = new Elysia({ prefix: "/dashboard" })
  .use(session)
  .model(Model)
  .get(
    "/number-of-plans",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((company) => company.employeeId || []),
          role: user.role,
          effectiveRole: query.role ?? user.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getAllNumberOfPlans(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลจำนวนแผนงานสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.queryFilters,
      detail: {
        description: "endpoint สำหรับข้อมูลจำนวนแผนงาน",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/actual-cost/summary",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((company) => company.employeeId || []),
          role: user.role,
          effectiveRole: query.role ?? user.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getActualCostSummary(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลค่าใช้จ่ายจริงสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.actualCostSummaryQuery,
      detail: {
        description: "endpoint สำหรับข้อมูลต้นทุนจริงของทุกแผนงาน",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/actual-cost/by-type",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!query.type) {
          return status(400, { success: false, message: "กรุณาระบุประเภทค่าใช้จ่าย (type)" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((company) => company.employeeId || []),
          role: user.role,
          effectiveRole: query.role ?? user.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getActualCostByType(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลค่าใช้จ่ายจริงต่อแผนงานสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.actualCostSummaryQuery,
      detail: {
        description: "endpoint สำหรับข้อมูลต้นทุนจริงต่อประเภทค่าใช้จ่าย",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/graph/actual-cost",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!query.year && !(query.from && query.to)) {
          query.year = new Date().getFullYear().toString()
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((company) => company.employeeId || []),
          role: user.role,
          effectiveRole: query.role ?? user.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getActualCostGraphData(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลกราฟค่าใช้จ่ายจริงสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.actualCostSummaryQuery,
      detail: {
        description: "endpoint สำหรับข้อมูลกราฟค่าใช้จ่ายจริง",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/actual-cost/per-plan",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((company) => company.employeeId || []),
          role: user.role,
          effectiveRole: query.role ?? user.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getActualCostPerPlan(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลค่าใช้จ่ายจริงต่อแผนงานสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.actualCostSummaryQuery,
      detail: {
        description: "endpoint สำหรับข้อมูลค่าใช้จ่ายจริงต่อแผนงาน",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/actual-cost/per-plan/:documentId",
    async ({ params, query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const data = await Service.getActualCostPerPlanByType(
          params.documentId,
          (query.sort as "asc" | "desc") || "desc"
        )

        return status(200, {
          success: true,
          message: "ดึงข้อมูลค่าใช้จ่ายจริงสำเร็จ",
          data: data,
        })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      params: t.Object({
        documentId: t.String(),
      }),
      query: t.Object({
        sort: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")], { default: "desc" })),
      }),
      detail: {
        description: "endpoint สำหรับข้อมูลต้นทุนจริงต่อแผนงาน",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/dropdown/jv",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const data = await Service.getCompanyJVDropdown(query.accountId, query.role, query.search)

        return status(200, { success: true, message: "ดึงข้อมูล JV สำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: t.Object({
        accountId: t.Optional(t.String()),
        role: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        description: "endpoint สำหรับข้อมูล JV ใน dropdown",
        tags: ["Dashboard"],
      },
    }
  )
  .get(
    "/meta/graph-filters",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        if (!query.role) {
          return status(400, { success: false, message: "กรุณาระบุ role ในการดูข้อมูล" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }
        const data = await Service.getDashboardGraphFilterYears(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลตัวกรองกราฟสำเร็จ", data: data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.filterYearsQuery,
      detail: {
        description: "endpoint สำหรับข้อมูลตัวกรองกราฟ",
        tags: ["Dashboard"],
      },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F1 — GET /dashboard/summary
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/summary",
    async ({ user, query, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardSummary(query, userContext)
        return status(200, { success: true, data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: "summaryQuery",
      detail: {
        description: "ดึงข้อมูลสรุป dashboard ความคุ้มค่า",
        tags: ["Dashboard"],
      },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F1 — GET /dashboard/details
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/details",
    async ({ user, query, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardDetails(query, userContext)
        return status(200, { success: true, data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: "detailsQuery",
      detail: {
        description: "ดึงรายการแผนงานรายหมวดสำหรับ modal ใน dashboard ความคุ้มค่า",
        tags: ["Dashboard"],
      },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F2 — GET /dashboard/monthly-worthy
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/monthly-worthy",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardMonthlyWorthy(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลกราฟแผนงานคุ้มค่ารายเดือนสำเร็จ", data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: "monthlyWorthyQuery",
      detail: {
        description: "ดึงข้อมูลแผนงานคุ้มค่า (WORTHY) รายเดือน สำหรับ Bar Chart",
        tags: ["Dashboard"],
      },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F3 — GET /dashboard/top-locations
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/top-locations",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardTopLocations(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูล Top Locations สำเร็จ", data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.topLocationsQuery,
      detail: { description: "ดึง Top 5 สถานที่ Onsite ที่ไปบ่อยที่สุด สำหรับ Widget", tags: ["Dashboard"] },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F3 — GET /dashboard/location-plans
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/location-plans",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardLocationPlans(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลแผนงานตามสถานที่สำเร็จ", data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.locationPlansQuery,
      detail: {
        description: "ดึงรายการสถานที่ทั้งหมด + แผนงานของสถานที่ที่เลือก สำหรับ Modal",
        tags: ["Dashboard"],
      },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F4 — GET /dashboard/top-jv-costs
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/top-jv-costs",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardTopJvCosts(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูล Top JV Costs สำเร็จ", data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: Model.topJvCostsQuery,
      detail: { description: "ดึง Top 5 JV ที่มี Actual Cost สูงสุด สำหรับ Widget", tags: ["Dashboard"] },
    }
  )

  // ════════════════════════════════════════════════════════════════════
  // F4 — GET /dashboard/jv-plans
  // ════════════════════════════════════════════════════════════════════

  .get(
    "/jv-plans",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, { success: false, message: "Cookie Token หมดอายุ หรือไม่ถูกต้อง" })
        }

        const roleCheck = validateViewAsRole(query.role, user.role, user.isSupervisor)
        if (!roleCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์ดูข้อมูลในฐานะ role นี้" })
        }

        const jvCheck = applyJvPermission(query, user, roleCheck.effectiveRole)
        if (!jvCheck.allowed) {
          return status(403, { success: false, message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้" })
        }

        const userContext = {
          employeeId: user.companies.flatMap((c) => c.employeeId || []),
          role: user.role,
          effectiveRole: query.role,
          isSupervisor: user.isSupervisor,
          companies: user.companies.map((c) => c.companyName),
          gmCompany: user.gmCompany || [],
        }

        const data = await Service.getDashboardJvPlans(query, userContext)

        return status(200, { success: true, message: "ดึงข้อมูลแผนงานตาม JV สำเร็จ", data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      isAuthWithToken: true,
      query: "jvPlansQuery",
      detail: {
        description: "ดึงรายชื่อแผนงานทั้งหมดที่เกี่ยวข้องกับ JV ที่เลือก พร้อมยอด Actual Cost",
        tags: ["Dashboard"],
      },
    }
  )
