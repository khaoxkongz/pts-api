import { t } from "elysia"

import * as PlannerModel from "@/modules/planner/model.js"

export const insertInputActualBudget = t.Object({
  actualBudget: t.ObjectString({
    items: t.Array(PlannerModel.actualBudgetItem),
  }),
  actualBudgetFiles: t.Optional(t.Files()),
})

export const queriesGAPlanners = t.Optional(
  t.Object({
    page: t.Optional(t.Number({ default: 1 })),
    pageSize: t.Optional(t.Number({ default: 6 })),
    document: t.Optional(t.String()),
    from: t.Optional(t.String()),
    to: t.Optional(t.String()),
    status: t.Optional(t.String()),
  })
)

export type QueriesGAPlannersType = typeof queriesGAPlanners.static
