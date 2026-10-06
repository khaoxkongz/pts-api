import { t } from "elysia"

export const allowancePolicy = t.Object({
  id: t.String(),
  positionKey: t.String(),
  aliases: t.Array(t.String()),
  groupNameTh: t.String(),
  dailyRate: t.Number(),
  monthlyLimit: t.Number(),
  effectiveFrom: t.String(),
  effectiveTo: t.Union([t.String(), t.Null()]),
  isActive: t.Boolean(),
  deletedAt: t.Union([t.String(), t.Null()]),
  createdBy: t.String(),
  updatedBy: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
})

export const createAllowancePolicyInput = t.Object({
  positionKey: t.String(),
  aliases: t.Array(t.String(), { minItems: 1 }),
  groupNameTh: t.String(),
  dailyRate: t.Number({ minimum: 0 }),
  monthlyLimit: t.Number({ minimum: 0 }),
  effectiveFrom: t.String(),
  effectiveTo: t.Optional(t.Nullable(t.String())),
  isActive: t.Optional(t.Boolean({ default: true })),
})

export const patchAllowancePolicyInput = t.Partial(createAllowancePolicyInput)

export const migrateAllowancePolicyYearInput = t.Object({
  sourceYear: t.Number({ minimum: 1900 }),
  targetYear: t.Number({ minimum: 1900 }),
  effectiveFrom: t.String(),
  effectiveTo: t.Optional(t.Nullable(t.String())),
})

export const queriesAllowancePolicies = t.Object({
  includeDeleted: t.Optional(t.Boolean({ default: false })),
  includeInactive: t.Optional(t.Boolean({ default: false })),
})

export const allowancePolicySuccess = t.Object({
  success: t.Boolean(),
  message: t.String(),
})

export const allowancePolicyListResponse = t.Object({
  success: t.Boolean(),
  data: t.Array(allowancePolicy),
})

export const allowancePolicyDetailResponse = t.Object({
  success: t.Boolean(),
  data: allowancePolicy,
})

export const allowancePolicyMigrateYearResponse = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: t.Object({
    sourceYear: t.Number(),
    targetYear: t.Number(),
    effectiveFrom: t.String(),
    effectiveTo: t.Union([t.String(), t.Null()]),
    sourcePolicies: t.Number(),
    closedPolicies: t.Number(),
    upsertedPolicies: t.Number(),
  }),
})

export const allowancePolicyUnauthorizedError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" }),
})

export const allowancePolicyForbiddenError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "สิทธิ์ไม่เพียงพอ" }),
})

export const allowancePolicyBadRequestError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String(),
})

export const allowancePolicyNotFoundError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "ไม่พบข้อมูลที่ร้องขอภายในระบบ" }),
})

export const allowancePolicyInternalServerError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }),
})
