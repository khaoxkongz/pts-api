import { t } from "elysia"

export const allowanceSource = t.Union([t.Literal("WF"), t.Literal("DWF")])

export const allowancePreviewInput = t.Object({
  employeeIds: t.Array(t.String(), { minItems: 1 }),
  startDate: t.String(),
  endDate: t.String(),
})

export const allowancePreviewRecord = t.Object({
  source: allowanceSource,
  employeeId: t.String(),
  usedAmount: t.Number(),
  monthlyBudget: t.Number(),
  documentStatus: t.String(),
  updateAt: t.String(),
})

export const allowancePreviewSuccess = t.Object({
  success: t.Boolean(),
  message: t.String(),
  data: t.Object({
    summary: t.Object({
      employeeId: t.String(),
      positionLevelRaw: t.String(),
      positionPolicyGroup: t.String(),
      months: t.Array(
        t.Object({
          month: t.String(),
          allowanceMonthly: t.Number(),
          allowanceDaily: t.Number(),
          allowanceAccum: t.Number(),
          allowanceRemaining: t.Number(),
          updatedAt: t.String(),
        })
      ),
    }),
  }),
})

export const allowancePreviewFailure = t.Object({
  success: t.Boolean(),
  message: t.String(),
  errors: t.Array(
    t.Object({
      source: allowanceSource,
      employeeId: t.String(),
      code: t.String(),
    })
  ),
})

export const allowanceBadRequestError = t.Object({
  success: t.Boolean(),
  message: t.String(),
})

export const allowanceUnauthorizedError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" }),
})

export const allowanceInternalServerError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }),
})
