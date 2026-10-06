import { type PipelineStage, type QueryFilter } from "mongoose"

import { CompanyJV, type TCompanyJV } from "@/models/employee-ra.js"
import { Planner, type TPlanner } from "@/models/planner.js"

import {
  DASHBOARD_CATEGORY_LABELS,
  DASHBOARD_CATEGORY_ORDER,
  DASHBOARD_STATUSES,
  MODERATE_VALUES,
  NOT_WORTHY_VALUES,
  WORTHY_VALUES,
} from "./constants.js"
import {
  type TWorthinessCategory,
  type DashboardDetailsMetrics,
  type DashboardSummaryMetrics,
  type GraphActualCostData,
} from "./type.js"

export async function getAllNumberOfPlans($match: Record<string, unknown> = {}) {
  const pipeline: PipelineStage[] = [
    { $match: $match },

    { $addFields: { status: { $setUnion: ["$status", []] } } },

    {
      $facet: {
        total: [{ $count: "count" }],

        byStatus: [{ $unwind: "$status" }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return result ?? { byStatus: [], total: [{ count: 0 }] }
}

export async function getActualCostSummary($match: Record<string, unknown> = {}, sort: "asc" | "desc" = "desc") {
  const pipeline: PipelineStage[] = [
    { $match: $match },
    {
      $facet: {
        totalActualCost: [
          { $unwind: "$actualBudget" },
          {
            $group: {
              _id: "$actualBudget.type",
              totalActualCost: { $sum: "$actualBudget.price" },
            },
          },
          { $sort: { totalActualCost: sort === "asc" ? 1 : -1 } },
        ],

        grandTotalActualCost: [
          { $unwind: "$actualBudget" },
          {
            $group: {
              _id: null,
              totalActualCost: { $sum: "$actualBudget.price" },
            },
          },
        ],

        // Allowance lives on the planner root, not in actualBudget[] — sum it separately (one per plan).
        allowanceTotal: [{ $group: { _id: null, total: { $sum: { $ifNull: ["$allowanceClaimed", 0] } } } }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)

  const allowanceTotal = Number(result?.allowanceTotal?.[0]?.total ?? 0)

  return {
    typeSummary: [...(result?.totalActualCost ?? []), { _id: "ค่าเบี้ยเลี้ยง", totalActualCost: allowanceTotal }],
    grandTotal: (result?.grandTotalActualCost?.[0]?.totalActualCost ?? 0) + allowanceTotal,
  }
}

export async function getActualCostByType(
  $match: Record<string, unknown>,
  typeTh: string,
  sort: "asc" | "desc" = "desc",
  page = 1,
  limit = 10
) {
  const skip = Math.max(0, (page - 1) * limit)

  // Allowance is a planner-root scalar, not an actualBudget[] entry: per-plan cost is
  // `allowanceClaimed` directly, and only plans that actually claimed (> 0) are listed.
  const pipeline: PipelineStage[] =
    typeTh === "ค่าเบี้ยเลี้ยง"
      ? [
          { $match: { ...$match, allowanceClaimed: { $gt: 0 } } },
          {
            $facet: {
              plans: [
                { $sort: { allowanceClaimed: sort === "asc" ? 1 : -1, _id: 1 } },
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    _id: 0,
                    name: 1,
                    documentId: 1,
                    totalActualCost: "$allowanceClaimed",
                  },
                },
              ],
              totalCount: [{ $count: "count" }],
              grandTotal: [{ $group: { _id: null, total: { $sum: "$allowanceClaimed" } } }],
            },
          },
        ]
      : [
          { $match: $match },

          { $unwind: "$actualBudget" },
          { $match: { "actualBudget.type": typeTh } },

          //รวมค่าใช้จ่าย type นี้ ต่อแผน
          {
            $group: {
              _id: "$_id",
              name: { $first: "$name" },
              documentId: { $first: "$documentId" },
              dateRange: { $first: "$dateRange" },
              jvs: { $first: "$jvs" },
              totalActualCost: { $sum: "$actualBudget.price" },
            },
          },

          { $sort: { totalActualCost: sort === "asc" ? 1 : -1, _id: 1 } },

          {
            $facet: {
              plans: [
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    _id: 0,
                    name: 1,
                    documentId: 1,
                    totalActualCost: 1,
                  },
                },
              ],
              totalCount: [{ $count: "count" }],
              grandTotal: [{ $group: { _id: null, total: { $sum: "$totalActualCost" } } }],
            },
          },
        ]

  const [result] = await Planner.aggregate(pipeline)

  return {
    plans: result?.plans ?? [],
    total: result?.grandTotal?.[0]?.total ?? 0,
    totalCount: result?.totalCount?.[0]?.count ?? 0,
  }
}

export async function getActualCostGraphData($match: Record<string, unknown> = {}) {
  const pipeline: PipelineStage[] = [
    { $match: $match },

    {
      $project: {
        year: {
          $year: {
            date: "$dateRange.from",
            timezone: "Asia/Bangkok",
          },
        },
        month: {
          $month: {
            date: "$dateRange.from",
            timezone: "Asia/Bangkok",
          },
        },

        totalActualCost: {
          $add: [
            {
              $sum: {
                $map: {
                  input: { $ifNull: ["$actualBudget", []] },
                  as: "budget",
                  in: { $ifNull: ["$$budget.price", 0] },
                },
              },
            },
            { $ifNull: ["$allowanceClaimed", 0] },
          ],
        },
      },
    },

    {
      $group: {
        _id: {
          year: "$year",
          month: "$month",
        },
        totalActualCost: { $sum: "$totalActualCost" },
      },
    },

    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
      },
    },
  ]

  const result = await Planner.aggregate(pipeline)
  const response: GraphActualCostData[] = result.map((item) => ({
    year: Number(item._id.year),
    month: Number(item._id.month),
    totalActualCost: Number(item.totalActualCost),
  }))

  return response
}

export async function getActualCostPerPlan(
  $match: Record<string, unknown> = {},
  sort: "asc" | "desc" = "desc",
  page = 1,
  limit = 10
) {
  const skip = Math.max(0, (page - 1) * limit)

  const pipeline: PipelineStage[] = [
    { $match: $match },

    {
      $project: {
        name: 1,
        documentId: 1,
        dateRange: 1,
        jvs: 1,

        totalActualCost: {
          $add: [
            {
              $sum: {
                $map: {
                  input: { $ifNull: ["$actualBudget", []] },
                  as: "budget",
                  in: { $ifNull: ["$$budget.price", 0] },
                },
              },
            },
            { $ifNull: ["$allowanceClaimed", 0] },
          ],
        },
      },
    },

    { $sort: { totalActualCost: sort === "asc" ? 1 : -1, _id: 1 } },

    {
      $facet: {
        plans: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              name: 1,
              documentId: 1,
              totalActualCost: 1,
            },
          },
        ],

        totalCount: [{ $count: "count" }],

        grandTotal: [
          {
            $group: {
              _id: null,
              total: { $sum: "$totalActualCost" },
            },
          },
        ],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)

  return {
    plans: result?.plans ?? [],
    total: result?.grandTotal?.[0]?.total ?? 0,
    totalCount: result?.totalCount?.[0]?.count ?? 0,
  }
}

export async function getActualCostPerPlanByType($match: Record<string, unknown> = {}, sort: "asc" | "desc" = "desc") {
  const pipeline: PipelineStage[] = [
    { $match: $match },

    {
      $facet: {
        typeSummary: [
          { $unwind: "$actualBudget" },
          {
            $group: {
              _id: "$actualBudget.type",
              value: { $sum: { $ifNull: ["$actualBudget.price", 0] } },
            },
          },
          { $sort: { value: sort === "asc" ? 1 : -1 } },
          {
            $project: {
              _id: 0,
              key: "$_id",
              value: 1,
            },
          },
        ],

        grandTotalActualCost: [
          { $unwind: "$actualBudget" },
          {
            $group: {
              _id: null,
              totalActualCost: {
                $sum: { $ifNull: ["$actualBudget.price", 0] },
              },
            },
          },
        ],

        // Allowance lives on the planner root, not in actualBudget[] — surface it as its own type row.
        allowanceTotal: [{ $group: { _id: null, total: { $sum: { $ifNull: ["$allowanceClaimed", 0] } } } }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)

  const allowanceTotal = Number(result?.allowanceTotal?.[0]?.total ?? 0)

  return {
    typeSummary: [...(result?.typeSummary ?? []), { key: "ค่าเบี้ยเลี้ยง", value: allowanceTotal }],
    grandTotal: (result?.grandTotalActualCost?.[0]?.totalActualCost ?? 0) + allowanceTotal,
  }
}

export async function getCompanyJVDropdown($match: QueryFilter<TCompanyJV>, search?: string) {
  if (search) {
    if (!$match.$and) {
      $match.$and = []
    }

    $match.$and.push({
      companyFullNameTh: { $regex: search, $options: "i" },
    })
  }

  const result = await CompanyJV.find($match).lean()

  return result ?? []
}

export async function getYearsByMatch(
  accessMatch: QueryFilter<TPlanner>,
  graphMatch: QueryFilter<TPlanner>
): Promise<string[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        status: { $in: DASHBOARD_STATUSES },
        "dateRange.from": { $type: "date" },
        ...accessMatch,
        ...graphMatch,
      },
    },
    {
      $group: { _id: { $year: "$dateRange.from" } },
    },
    { $sort: { _id: 1 } },
  ]

  const result = await Planner.aggregate(pipeline)
  return result.map((r) => r._id.toString())
}

// ════════════════════════════════════════════════════════════════════
// F1 —
// ════════════════════════════════════════════════════════════════════

const ZERO_COUNTS: Record<TWorthinessCategory, number> = {
  WORTHY: 0,
  MODERATE: 0,
  NOT_WORTHY: 0,
  UNANALYZED: 0,
  OTHER: 0,
}

function buildCondArgs(
  condition: Record<string, unknown>,
  onTrue: unknown,
  onFalse: unknown
): [Record<string, unknown>, unknown, unknown] {
  return [condition, onTrue, onFalse]
}

function buildCategoryExpression(): Record<string, unknown> {
  return {
    $let: {
      vars: {
        normalizedWorthiness: {
          $toLower: {
            $trim: {
              input: {
                $ifNull: ["$worthiness.worthiness", ""],
              },
            },
          },
        },
      },
      in: {
        $cond: buildCondArgs(
          {
            $in: ["$$normalizedWorthiness", [...WORTHY_VALUES]],
          },
          "WORTHY",
          {
            $cond: buildCondArgs(
              {
                $in: ["$$normalizedWorthiness", [...MODERATE_VALUES]],
              },
              "MODERATE",
              {
                $cond: buildCondArgs(
                  {
                    $in: ["$$normalizedWorthiness", [...NOT_WORTHY_VALUES]],
                  },
                  "NOT_WORTHY",
                  {
                    $cond: buildCondArgs(
                      {
                        $eq: ["$$normalizedWorthiness", ""],
                      },
                      "UNANALYZED",
                      "OTHER"
                    ),
                  }
                ),
              }
            ),
          }
        ),
      },
    },
  }
}

function buildMetricsFromCountsStages(includeSelectedItems: boolean): PipelineStage[] {
  const projectStage: Record<string, unknown> = {
    _id: 0,
    totalPlans: 1,
    defaultCategoryKey: "$topCategory.key",
    categories: {
      $map: {
        input: "$roundedEntries",
        as: "entry",
        in: {
          key: "$$entry.key",
          label: {
            $cond: buildCondArgs({ $eq: ["$$entry.key", "WORTHY"] }, DASHBOARD_CATEGORY_LABELS.WORTHY, {
              $cond: buildCondArgs({ $eq: ["$$entry.key", "MODERATE"] }, DASHBOARD_CATEGORY_LABELS.MODERATE, {
                $cond: buildCondArgs({ $eq: ["$$entry.key", "NOT_WORTHY"] }, DASHBOARD_CATEGORY_LABELS.NOT_WORTHY, {
                  $cond: buildCondArgs(
                    { $eq: ["$$entry.key", "UNANALYZED"] },
                    DASHBOARD_CATEGORY_LABELS.UNANALYZED,
                    DASHBOARD_CATEGORY_LABELS.OTHER
                  ),
                }),
              }),
            }),
          },
          count: "$$entry.count",
          percent: {
            $cond: [
              { $eq: ["$$entry.key", "$topCategory.key"] },
              { $add: ["$$entry.percent", "$adjustment"] },
              "$$entry.percent",
            ],
          },
        },
      },
    },
  }

  if (includeSelectedItems) {
    projectStage.selectedItems = 1
  }

  return [
    {
      $addFields: {
        countsObject: {
          $mergeObjects: [
            ZERO_COUNTS,
            {
              $arrayToObject: {
                $map: {
                  input: "$categoryCounts",
                  as: "row",
                  in: { k: "$$row._id", v: "$$row.count" },
                },
              },
            },
          ],
        },
      },
    },
    {
      $addFields: {
        countEntries: [
          { key: "WORTHY", count: { $ifNull: ["$countsObject.WORTHY", 0] } },
          { key: "MODERATE", count: { $ifNull: ["$countsObject.MODERATE", 0] } },
          { key: "NOT_WORTHY", count: { $ifNull: ["$countsObject.NOT_WORTHY", 0] } },
          { key: "UNANALYZED", count: { $ifNull: ["$countsObject.UNANALYZED", 0] } },
          { key: "OTHER", count: { $ifNull: ["$countsObject.OTHER", 0] } },
        ],
      },
    },
    {
      $addFields: {
        topCategory: {
          $reduce: {
            input: "$countEntries",
            initialValue: { key: DASHBOARD_CATEGORY_ORDER[0], count: -1 },
            in: {
              $cond: [{ $gt: ["$$this.count", "$$value.count"] }, "$$this", "$$value"],
            },
          },
        },
        roundedEntries: {
          $map: {
            input: "$countEntries",
            as: "entry",
            in: {
              key: "$$entry.key",
              count: "$$entry.count",
              percent: {
                $cond: [
                  { $gt: ["$totalPlans", 0] },
                  {
                    $round: [{ $multiply: [{ $divide: ["$$entry.count", "$totalPlans"] }, 100] }, 0],
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        adjustment: {
          $cond: [{ $gt: ["$totalPlans", 0] }, { $subtract: [100, { $sum: "$roundedEntries.percent" }] }, 0],
        },
      },
    },
    {
      $project: projectStage,
    },
  ]
}

function getEmptySummary(): DashboardSummaryMetrics {
  return {
    totalPlans: 0,
    defaultCategoryKey: "WORTHY",
    categories: DASHBOARD_CATEGORY_ORDER.map((key) => ({
      key,
      label: DASHBOARD_CATEGORY_LABELS[key],
      count: 0,
      percent: 0,
    })),
  }
}

export async function aggregateDashboardSummary(match: QueryFilter<TPlanner>): Promise<DashboardSummaryMetrics> {
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        dashboardCategory: buildCategoryExpression(),
      },
    },
    {
      $facet: {
        totalPlans: [{ $count: "count" }],
        categoryCounts: [{ $group: { _id: "$dashboardCategory", count: { $sum: 1 } } }],
      },
    },
    {
      $project: {
        totalPlans: { $ifNull: [{ $arrayElemAt: ["$totalPlans.count", 0] }, 0] },
        categoryCounts: 1,
      },
    },
    ...buildMetricsFromCountsStages(false),
  ]

  const [result] = await Planner.aggregate<DashboardSummaryMetrics>(pipeline)
  return result ?? getEmptySummary()
}

export async function aggregateDashboardDetails(
  match: QueryFilter<TPlanner>,
  category: TWorthinessCategory
): Promise<DashboardDetailsMetrics> {
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        dashboardCategory: buildCategoryExpression(),
      },
    },
    {
      $facet: {
        totalPlans: [{ $count: "count" }],
        categoryCounts: [{ $group: { _id: "$dashboardCategory", count: { $sum: 1 } } }],
        selectedItems: [
          {
            $match: { dashboardCategory: category },
          },
          {
            $project: {
              _id: 0,
              name: 1,
              documentId: 1,
            },
          },
          {
            $sort: { name: 1, documentId: 1 },
          },
        ],
      },
    },
    {
      $project: {
        totalPlans: { $ifNull: [{ $arrayElemAt: ["$totalPlans.count", 0] }, 0] },
        categoryCounts: 1,
        selectedItems: { $ifNull: ["$selectedItems", []] },
      },
    },
    ...buildMetricsFromCountsStages(true),
    {
      $addFields: {
        selectedCategory: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$categories",
                    as: "item",
                    cond: { $eq: ["$$item.key", category] },
                  },
                },
                0,
              ],
            },
            {
              key: category,
              label: DASHBOARD_CATEGORY_LABELS[category],
              count: 0,
              percent: 0,
            },
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalPlans: 1,
        defaultCategoryKey: 1,
        categories: 1,
        selectedItems: 1,
        selectedCategory: 1,
      },
    },
  ]

  const [result] = await Planner.aggregate<DashboardDetailsMetrics>(pipeline)

  if (result) {
    return result
  }

  const emptySummary = getEmptySummary()
  return {
    ...emptySummary,
    selectedItems: [],
    selectedCategory: {
      key: category,
      label: DASHBOARD_CATEGORY_LABELS[category],
      count: 0,
      percent: 0,
    },
  }
}

export async function findAvailableDashboardYears(): Promise<number[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        status: {
          $in: [...DASHBOARD_STATUSES],
        },
        "dateRange.from": {
          $type: "date",
        },
      },
    },
    {
      $project: {
        year: {
          $add: [
            {
              $year: {
                date: "$dateRange.from",
                timezone: "Asia/Bangkok",
              },
            },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$year",
      },
    },
    {
      $sort: {
        _id: -1,
      },
    },
  ]

  const years = await Planner.aggregate<{ _id: number }>(pipeline)

  return years.map((year) => year._id)
}

// ════════════════════════════════════════════════════════════════════
// F2 — Monthly Worthy Bar Chart
// ════════════════════════════════════════════════════════════════════

export async function aggregateDashboardMonthlyWorthy(
  $match: Record<string, unknown>
): Promise<{ _id: { year: number; month: number }; count: number }[]> {
  const pipeline: PipelineStage[] = [
    // ① กรองข้อมูลตั้งต้นด้วย RBAC, เงื่อนไข JV และ DateRange (ที่ได้จาก Query Builder แล้ว)
    { $match: $match },
    // ② กรองเฉพาะแผนงานที่มีความคุ้มค่า (Worthy)
    {
      $match: {
        $expr: {
          $in: [{ $toLower: { $trim: { input: { $ifNull: ["$worthiness.worthiness", ""] } } } }, [...WORTHY_VALUES]],
        },
      },
    },
    // ③ จัดกลุ่มตามปีและเดือน (ยึดตามวันเริ่มต้นแผนงาน dateRange.from)
    {
      $group: {
        _id: {
          year: { $year: { date: "$dateRange.from", timezone: "Asia/Bangkok" } },
          month: { $month: { date: "$dateRange.from", timezone: "Asia/Bangkok" } },
        },
        count: { $sum: 1 },
      },
    },
    // ④ เรียงลำดับจากอดีตไปปัจจุบัน
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]

  return await Planner.aggregate<{ _id: { year: number; month: number }; count: number }>(pipeline)
}

// ════════════════════════════════════════════════════════════════════
// F3 — Top Onsite Locations
// ════════════════════════════════════════════════════════════════════

export async function aggregateTopLocations(
  $match: Record<string, unknown>,
  page: number,
  pageSize: number
): Promise<{
  items: { locationName: string; count: number }[]
  total: number
}> {
  const skip = (page - 1) * pageSize

  const pipeline: PipelineStage[] = [
    // ① กรองข้อมูลตั้งต้นตาม RBAC และเงื่อนไขต่างๆ
    { $match: $match },
    // ② แตก Array เพื่อให้ได้รายการ Tag สถานที่ทั้งหมด
    { $unwind: "$locations" },
    // ③ กรองเฉพาะรายการที่มีการระบุชื่อสถานที่จริงๆ (ไม่เป็นค่าว่างหรือ null)
    { $match: { "locations.name": { $exists: true, $nin: [null, ""] } } },
    // ④ จัดกลุ่มตามชื่อสถานที่และนับจำนวน Tag (Workload)
    {
      $group: {
        _id: "$locations.name",
        count: { $sum: 1 },
      },
    },
    {
      $facet: {
        items: [
          // ⑤ เรียงลำดับตามจำนวนจากมากไปน้อย
          { $sort: { count: -1, _id: 1 } },
          // ⑥ Pagination และเปลี่ยนชื่อฟิลด์ _id เป็น locationName
          { $skip: skip },
          { $limit: pageSize },
          { $project: { _id: 0, locationName: "$_id", count: 1 } },
        ],
        // ⑦ นับจำนวนสถานที่ทั้งหมด (Total Locations)
        total: [{ $count: "count" }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return {
    items: result?.items ?? [],
    total: result?.total?.[0]?.count ?? 0,
  }
}

export async function aggregateLocationPlans(
  $match: Record<string, unknown>,
  locationName: string,
  page: number,
  pageSize: number
): Promise<{
  total: number
  selectedPlans: { name: string; documentId: string }[]
}> {
  const skip = (page - 1) * pageSize

  const pipeline: PipelineStage[] = [
    // ① กรองเอกสารเบื้องต้นก่อน เพื่อลดจำนวน Document ที่ต้องนำไป Unwind (ดีต่อ Performance)
    { $match: { ...$match, "locations.name": locationName } },

    // ② แตก Array ออกมา เพื่อให้กลายเป็น "รายรายการ Tag (Workload)" แบบเดียวกับหน้าแรก
    { $unwind: "$locations" },

    // ③ กรองอีกรอบ เพื่อคัดเฉพาะ Tag ที่ชื่อตรงกับที่ Drill-down เข้ามา
    // (เพราะในแผนงานเดียวกัน อาจจะ Tag จังหวัดอื่นปนมาด้วย เราต้องตัดจังหวัดอื่นทิ้ง)
    { $match: { "locations.name": locationName } },

    {
      $facet: {
        total: [{ $count: "count" }],
        selectedPlans: [
          // ④ เรียงลำดับข้อมูล
          { $sort: { name: 1, documentId: 1 } },
          // ⑤ Pagination (ตอนนี้ page/limit จะนับตามจำนวน Tag แล้ว ไม่ใช่จำนวนแผนงาน)
          { $skip: skip },
          { $limit: pageSize },
          // ⑥ ดึงเฉพาะฟิลด์ที่ต้องการ
          { $project: { _id: 0, name: 1, documentId: 1 } },
        ],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return {
    total: result?.total?.[0]?.count ?? 0,
    selectedPlans: result?.selectedPlans ?? [],
  }
}

// ════════════════════════════════════════════════════════════════════
// F4 — Top JV Actual Cost
// ════════════════════════════════════════════════════════════════════

function extractJvCompanyNamesFromMatch(match: Record<string, unknown>): string[] {
  const names = new Set<string>()

  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    const record = node as Record<string, unknown>

    const directCompanyName = record["jvs.companyFullNameTh"]
    if (typeof directCompanyName === "string" && directCompanyName.trim()) {
      names.add(directCompanyName)
    } else if (
      directCompanyName &&
      typeof directCompanyName === "object" &&
      !Array.isArray(directCompanyName) &&
      Array.isArray((directCompanyName as Record<string, unknown>).$in)
    ) {
      for (const value of (directCompanyName as { $in: unknown[] }).$in) {
        if (typeof value === "string" && value.trim()) {
          names.add(value)
        }
      }
    }

    for (const value of Object.values(record)) {
      visit(value)
    }
  }

  visit(match)
  return [...names]
}

export async function aggregateTopJvCosts(
  $match: Record<string, unknown>,
  page: number,
  pageSize: number,
  sortDirection: 1 | -1 = -1
): Promise<{
  items: { companyName: string; totalActualCost: number }[]
  total: number
}> {
  const skip = (page - 1) * pageSize

  const selectedJvCompanyNames = extractJvCompanyNamesFromMatch($match)
  const pipeline: PipelineStage[] = [
    // ① กรองข้อมูลตั้งต้นตาม RBAC และเงื่อนไขต่างๆ
    { $match: $match },
    // ② แตก Array ของ jvs ออกมาเป็นรายแถว
    { $unwind: "$jvs" },
    // ③ ถ้ามีการ filter JV ให้ filter ซ้ำหลัง unwind เพื่อให้เหลือเฉพาะ JV ที่เลือกจริงๆ
    ...(selectedJvCompanyNames.length > 0
      ? [
          {
            $match: {
              "jvs.companyFullNameTh": { $in: selectedJvCompanyNames },
            },
          },
        ]
      : []),
    // ④ กรองเฉพาะรายการที่มีค่าใช้จ่ายจริง (actualExpenseRatio) เป็นตัวเลข
    {
      $match: {
        "jvs.actualExpenseRatio": {
          $exists: true,
          $ne: null,
          $type: "number",
        },
      },
    },
    // ⑤ จัดกลุ่มตามชื่อบริษัทและรวมยอดค่าใช้จ่าย
    {
      $group: {
        _id: "$jvs.companyFullNameTh",
        totalActualCost: { $sum: "$jvs.actualExpenseRatio" },
      },
    },
    // ⑥ ประมวลผลแบบคู่ขนานตามแต่ละบริษัท
    {
      $facet: {
        items: [
          // ⑥.① เรียงลำดับตามยอดค่าใช้จ่าย (จากมากไปน้อยเป็นค่าเริ่มต้น)
          { $sort: { totalActualCost: sortDirection, _id: 1 } },
          // ⑥.② Pagination และเลือกเฉพาะฟิลด์ที่ต้องการ
          { $skip: skip },
          { $limit: pageSize },
          {
            $project: {
              _id: 0,
              companyName: "$_id",
              totalActualCost: 1,
            },
          },
        ],
        // ⑥.③ นับจำนวนบริษัททั้งหมด (Total Companies)
        totalCount: [{ $count: "count" }],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return {
    items: result?.items ?? [],
    total: result?.totalCount?.[0]?.count ?? 0,
  }
}

export async function aggregateJvPlans(
  $match: Record<string, unknown>,
  companyName: string,
  page: number,
  pageSize: number,
  sortDirection: 1 | -1
): Promise<{
  plans: { _id: string; name: string; actualExpenseRatio: number }[]
  total: { count: number }[]
  selectedJv: { totalActualCost: number }[]
}> {
  const skip = (page - 1) * pageSize

  const selectedJvCompanyNames = extractJvCompanyNamesFromMatch($match)
  const pipeline: PipelineStage[] = [
    // ① กรองแผนงานตั้งต้นด้วยเงื่อนไขต่างๆ
    { $match: $match },
    // ② แตก Array เพื่อเข้าถึงรายการ jvs แต่ละบรรทัด
    { $unwind: "$jvs" },
    ...(selectedJvCompanyNames.length > 0
      ? [
          {
            $match: {
              "jvs.companyFullNameTh": { $in: selectedJvCompanyNames },
            },
          } as PipelineStage,
        ]
      : []),
    // ③ กรองเฉพาะบริษัทที่เรา Drill-down เข้ามา และมีค่าใช้จ่ายจริง
    {
      $match: {
        "jvs.companyFullNameTh": companyName,
        "jvs.actualExpenseRatio": {
          $exists: true,
          $ne: null,
          $type: "number",
        },
      },
    },
    // ④ จัดกลุ่มตามแผนงาน (กรณี 1 แผนงานมีการใส่ JV เดิมซ้ำ จะถูกรวมเป็นยอดเดียวต่อแผนงาน)
    {
      $group: {
        _id: "$documentId",
        name: { $first: "$name" },
        actualExpenseRatio: { $sum: "$jvs.actualExpenseRatio" },
      },
    },
    // ⑤ ประมวลผลแบบคู่ขนานตามแต่ละบริษัท
    {
      $facet: {
        // ⑤.① หาจำนวนแผนงานทั้งหมดของบริษัทนี้ (Total Plans)
        total: [{ $count: "count" }],
        // ⑤.② หายอดเงินรวมของบริษัทนี้ (รวมจากทุกแผนงาน) ก่อนที่จะทำ Pagination
        selectedJv: [
          {
            $group: {
              _id: null,
              totalActualCost: { $sum: "$actualExpenseRatio" },
            },
          },
        ],
        plans: [
          // ⑤.③ เรียงลำดับแผนงานตามยอดค่าใช้จ่าย ก่อนทำ Pagination เพื่อประสิทธิภาพ
          { $sort: { actualExpenseRatio: sortDirection, _id: 1 } },
          // ⑤.④ Pagination และเลือกฟิลด์ที่ต้องการ
          { $skip: skip },
          { $limit: pageSize },
          {
            $project: {
              _id: 1,
              name: 1,
              actualExpenseRatio: 1,
            },
          },
        ],
      },
    },
  ]

  const [result] = await Planner.aggregate(pipeline)
  return result ?? { plans: [], total: [], selectedJv: [] }
}
