import { type PipelineStage } from "mongoose"

import { Planner } from "@/models/planner.js"

export async function getGaDashboardData(
  dataMatch: Record<string, unknown>,
  baseMatch: Record<string, unknown>,
  statusOrderLogic: Record<string, unknown>,
  skip: number,
  limit: number
) {
  const pipeline: PipelineStage[] = [
    {
      $facet: {
        data: [
          { $match: dataMatch },
          { $addFields: { statusOrder: statusOrderLogic } },
          { $sort: { statusOrder: 1, updatedAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              statusOrder: 0,
              _id: 0,
              "participants._id": 0,
              "jvs._id": 0,
              "jvs.approversList._id": 0,
              "estimatedBudget._id": 0,
              "estimatedBudget.sharedWith._id": 0,
              "location._id": 0,
              "dateRange._id": 0,
              "outcome._id": 0,
            },
          },
        ],
        filteredCount: [{ $match: dataMatch }, { $count: "count" }],
        allStatusStats: [{ $match: baseMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return result
}
