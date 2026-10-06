import { t } from "elysia"

export const confirmCancelBody = t.Object({
  documentId: t.String(),
  employeeId: t.Array(t.String()),
  type: t.Union([t.Literal("Reject"), t.Literal("Cancel")]),
  // Optional per-month selector (YYYY-MM). Omitted = confirm every same-type pending month.
  month: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}$" })),
})

export const cancelByMonthBody = t.Object({
  documentId: t.String(),
  employeeId: t.Array(t.String()),
  month: t.String({ pattern: "^\\d{4}-\\d{2}$" }),
})

export type ConfirmCancelBody = typeof confirmCancelBody.static
export type CancelByMonthBody = typeof cancelByMonthBody.static
