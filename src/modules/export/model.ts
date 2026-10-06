import { t } from "elysia"

import { statusEnum } from "@/modules/planner/model.js"

import { STANDARD_ORDER } from "./column-config.js"

/**
 * Query parameters for planner export
 */
export const queriesExportPlanner = t.Object({
  from: t.Optional(t.String({ description: "Filter by dateRange.from (ISO date)" })),
  to: t.Optional(t.String({ description: "Filter by dateRange.to (ISO date)" })),
  status: t.Optional(t.Array(statusEnum, { description: "Filter by statuses" })),
  documentId: t.Optional(t.Array(t.String({ description: "Filter by specific documentId" }))),
  excludeDocumentId: t.Optional(t.Array(t.String({ description: "Exclude specific documentId" }))),
  q: t.Optional(t.String({ description: "Filter by search query of document plan" })),
})

const exportColumnKeySchema = t.Union(STANDARD_ORDER.map((key) => t.Literal(key)))

export const exportColumnProjection = t.Record(exportColumnKeySchema, t.Boolean())

/**
 * Response types
 */
export const unauthorizedError = t.Object({
  success: t.Boolean(),
  message: t.String(),
})

export const internalServerError = t.Object({
  success: t.Boolean(),
  message: t.String(),
})
