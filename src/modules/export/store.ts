import { type QueryFilter } from "mongoose"

import { Planner, type TPlanner } from "@/models/planner.js"

/**
 * Get maximum locations count from filtered planners
 */
export async function getMaxLocations(filter: QueryFilter<TPlanner>): Promise<number> {
  const result = await Planner.aggregate([
    { $match: filter },
    { $project: { count: { $size: { $ifNull: ["$locations", []] } } } },
    { $group: { _id: null, max: { $max: "$count" } } },
  ])

  // Minimum 1 location column
  return Math.max(result[0]?.max || 1, 1)
}

/**
 * Find planners for export
 */
export async function findPlanners(filter: QueryFilter<TPlanner>) {
  return await Planner.find(filter, {}, { sort: { createdAt: 1 } }).lean()
}
