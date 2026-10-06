import { type PipelineStage, type QueryFilter, type UpdateQuery } from "mongoose"

import { Planner, type TPlanner } from "@/models/planner.js"

export async function findOnePlanner(filter: QueryFilter<TPlanner>) {
  return await Planner.findOne(filter).lean()
}

export async function createPlanner(data: Partial<TPlanner>) {
  const planner = new Planner(data)
  return await planner.save()
}

export async function updatePlanner(filter: QueryFilter<TPlanner>, update: UpdateQuery<TPlanner>) {
  await Planner.updateOne(filter, update)
}

export async function cancelPlanner(
  documentId: string,
  createdBy: string,
  currentVersion: number,
  currentStatuses: string[],
  cancellation: { reason: string; cancelledBy: string; cancelledAt: Date; previousStatuses: string[] },
  nextStatuses: string[]
) {
  return await Planner.findOneAndUpdate(
    {
      documentId,
      createdBy,
      __v: currentVersion,
      status: currentStatuses,
      cancellation: null,
    } as QueryFilter<TPlanner>,
    {
      $set: {
        status: nextStatuses,
        cancellation,
      },
      $inc: { __v: 1 },
    },
    { new: true }
  ).lean()
}

export async function countPlanners(filter: QueryFilter<TPlanner>) {
  return await Planner.countDocuments(filter)
}

export async function getPlanners(match: QueryFilter<TPlanner>, skip: number, limit: number) {
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        statusPriority: {
          $switch: {
            branches: [
              // eslint-disable-next-line unicorn/no-thenable
              { case: { $in: ["DRAFT", "$status"] }, then: 0 },
              {
                case: { $in: ["WAITING_EMP_SUMMARY", "$status"] },
                // eslint-disable-next-line unicorn/no-thenable
                then: 1,
              },
            ],
            default: 2,
          },
        },
      },
    },
    { $sort: { statusPriority: 1, createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { statusPriority: 0 } },
  ]

  const pipelineCount: PipelineStage[] = [{ $match: match }, { $count: "totalCount" }]

  const planners = await Planner.aggregate(pipeline).exec()

  const totalCountResult = await Planner.aggregate(pipelineCount).exec()

  return {
    planners,
    totalCount: totalCountResult[0]?.totalCount || 0,
  }
}
