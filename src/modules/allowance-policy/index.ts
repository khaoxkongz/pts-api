import { Elysia, t } from "elysia"

import { roles } from "@/plugins/role.js"
import { session } from "@/plugins/session.js"

import * as AllowancePolicyModel from "./model.js"
import * as AllowancePolicyService from "./service.js"
import { buildPatchPayload, parseDateOrNull } from "./utils.js"

export const allowancePolicy = new Elysia({ prefix: "/allowance/policies" })
  .use(session)
  .use(roles)
  .get(
    "",
    async ({ query, user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const data = await AllowancePolicyService.listPolicies({
          includeDeleted: query.includeDeleted ?? false,
          includeInactive: query.includeInactive ?? false,
        })
        return status(200, { success: true, data })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      query: AllowancePolicyModel.queriesAllowancePolicies,
      response: {
        200: AllowancePolicyModel.allowancePolicyListResponse,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "ดึงรายการ allowance policy",
        tags: ["Allowance Policy"],
      },
    }
  )
  .post(
    "",
    async ({ body, user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const effectiveFrom = parseDateOrNull(body.effectiveFrom)
        if (!effectiveFrom) {
          return status(400, { success: false, message: "effectiveFrom ไม่ถูกต้อง" })
        }

        const effectiveTo = body.effectiveTo ? parseDateOrNull(body.effectiveTo) : null
        if (body.effectiveTo && !effectiveTo) {
          return status(400, { success: false, message: "effectiveTo ไม่ถูกต้อง" })
        }

        const created = await AllowancePolicyService.createPolicy(
          {
            positionKey: body.positionKey,
            aliases: body.aliases,
            groupNameTh: body.groupNameTh,
            dailyRate: body.dailyRate,
            monthlyLimit: body.monthlyLimit,
            effectiveFrom,
            effectiveTo,
            isActive: body.isActive ?? true,
          },
          user.accountId
        )

        return status(201, { success: true, data: created })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      body: AllowancePolicyModel.createAllowancePolicyInput,
      response: {
        201: AllowancePolicyModel.allowancePolicyDetailResponse,
        400: AllowancePolicyModel.allowancePolicyBadRequestError,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "สร้าง allowance policy",
        tags: ["Allowance Policy"],
      },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const patchInput = buildPatchPayload(body)
        if (!patchInput.success) {
          return status(400, { success: false, message: patchInput.message })
        }

        const updated = await AllowancePolicyService.patchPolicy(params.id, patchInput.payload, user.accountId)

        if (!updated) {
          return status(404, { success: false, message: "ไม่พบข้อมูลที่ร้องขอภายในระบบ" })
        }

        return status(200, { success: true, data: updated })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      params: t.Object({ id: t.String() }),
      body: AllowancePolicyModel.patchAllowancePolicyInput,
      response: {
        200: AllowancePolicyModel.allowancePolicyDetailResponse,
        400: AllowancePolicyModel.allowancePolicyBadRequestError,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        404: AllowancePolicyModel.allowancePolicyNotFoundError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "แก้ไข allowance policy",
        tags: ["Allowance Policy"],
      },
    }
  )
  .delete(
    "/:id",
    async ({ params, user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const deleted = await AllowancePolicyService.softDeletePolicy(params.id, user.accountId)
        if (!deleted) {
          return status(404, { success: false, message: "ไม่พบข้อมูลที่ร้องขอภายในระบบ" })
        }

        return status(200, { success: true, message: "ลบ allowance policy สำเร็จ" })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      params: t.Object({ id: t.String() }),
      response: {
        200: AllowancePolicyModel.allowancePolicySuccess,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        404: AllowancePolicyModel.allowancePolicyNotFoundError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "ลบ allowance policy แบบ soft delete",
        tags: ["Allowance Policy"],
      },
    }
  )
  .post(
    "/migrate-year",
    async ({ body, user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const effectiveFrom = parseDateOrNull(body.effectiveFrom)
        if (!effectiveFrom) {
          return status(400, { success: false, message: "effectiveFrom ไม่ถูกต้อง" })
        }

        const effectiveTo = body.effectiveTo ? parseDateOrNull(body.effectiveTo) : null
        if (body.effectiveTo && !effectiveTo) {
          return status(400, { success: false, message: "effectiveTo ไม่ถูกต้อง" })
        }

        const result = await AllowancePolicyService.migratePoliciesToYear(
          {
            sourceYear: body.sourceYear,
            targetYear: body.targetYear,
            effectiveFrom,
            effectiveTo,
          },
          user.accountId
        )

        return status(200, {
          success: true,
          message: "ย้าย allowance policy รายปีสำเร็จ",
          data: result,
        })
      } catch (error) {
        if (
          error instanceof Error &&
          ["INVALID_YEAR_RANGE", "INVALID_SOURCE_YEAR", "EFFECTIVE_FROM_YEAR_MISMATCH"].includes(error.message)
        ) {
          return status(400, { success: false, message: "ข้อมูล migration ไม่ถูกต้อง" })
        }

        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      body: AllowancePolicyModel.migrateAllowancePolicyYearInput,
      response: {
        200: AllowancePolicyModel.allowancePolicyMigrateYearResponse,
        400: AllowancePolicyModel.allowancePolicyBadRequestError,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "คัดลอก policy จากปีเดิมเป็นปีใหม่แบบ migration-safe",
        tags: ["Allowance Policy"],
      },
    }
  )
  .post(
    "/seed-defaults",
    async ({ user, authorized, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }
      if (!authorized) {
        return status(403, { success: false, message: "สิทธิ์ไม่เพียงพอ" })
      }

      try {
        const result = await AllowancePolicyService.seedDefaultPolicies(user.accountId)
        return status(200, { success: true, message: `seed policy สำเร็จ ${result.upsertedCount} รายการ` })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      requireRole: ["SUPERADMIN"],
      response: {
        200: AllowancePolicyModel.allowancePolicySuccess,
        401: AllowancePolicyModel.allowancePolicyUnauthorizedError,
        403: AllowancePolicyModel.allowancePolicyForbiddenError,
        500: AllowancePolicyModel.allowancePolicyInternalServerError,
      },
      detail: {
        description: "seed allowance policy ค่าเริ่มต้นแบบ idempotent",
        tags: ["Allowance Policy"],
      },
    }
  )
