import { type TPlanner } from "@/models/planner.js"

import { ActualCostModel } from "./model.js"

export function calculateActualCostRatio(
  actualBudget: ActualCostModel.ActualCostModelType[],
  jvs: TPlanner["jvs"],
  allowanceClaimed = 0
) {
  if (!jvs.length) {
    throw new Error("JV list is empty")
  }

  const totalActualCost = actualBudget.reduce((sum, item) => sum + (item.price ?? 0), 0)
  const total = totalActualCost + allowanceClaimed

  return jvs.map((jv) => {
    const percent = jv.percentageRatio ?? 0

    return {
      actualPercentageRatio: percent,
      actualExpenseRatio: (total * percent) / 100,
    }
  })
}
