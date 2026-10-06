import { type PipelineStage } from "mongoose"

import { User } from "@/models/user.js"

export async function getRoleDashboardData(dataMatch: Record<string, unknown>, skip: number, limit: number) {
  const pipeline: PipelineStage[] = [
    {
      $facet: {
        data: [
          { $match: dataMatch },
          { $sort: { updatedAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
            },
          },
        ],
        total: [{ $match: dataMatch }, { $count: "count" }],
      },
    },
  ]
  const [result] = await User.aggregate(pipeline)
  return result
}
