import { DateTime } from "luxon"

import { Planner } from "@/models/planner.js"
import { User } from "@/models/user.js"
import * as PlannerModel from "@/modules/planner/model.js"
import { sortParticipantMonths } from "@/utils/participant-months.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS, type PlannerStatus } from "@/utils/status/status.js"

import { worthinessModel } from "./model.js"
import { escapeRegex, formatUser, safeDate, safeDateTime } from "./utils.js"

export abstract class worthinessService {
  public static async checkDefaultPlanner() {
    const countWaiting = await Planner.countDocuments({
      status: STATUS.WAITING_PLANNER_COST_ANALYSIS,
    })
    if (countWaiting > 0) {
      return {
        success: true,
        message: "มีแผนงานที่รอการวิเคราะห์ความคุ้มค่า",
        default: STATUS.WAITING_PLANNER_COST_ANALYSIS,
      }
    }
    return {
      success: true,
      message: "ไม่มีแผนงานที่รอการวิเคราะห์ความคุ้มค่า",
      default: "ALL",
    }
  }

  public static async getAllPlanner(query: worthinessModel.QueriesWorthType) {
    try {
      const limit = query.pageSize ?? 6
      const skip = ((query.page ?? 1) - 1) * limit
      const statusFilter = query.status || ""

      let baseMatch: Record<string, unknown>[] = [
        {
          status: {
            $in: [STATUS.WAITING_PLANNER_COST_ANALYSIS, STATUS.COMPLETED],
          },
        },
      ]
      let dataMatch: Record<string, unknown>[] = [...baseMatch]

      if (statusFilter && statusFilter !== "ALL") {
        const statusValues = Array.isArray(statusFilter) ? { $in: statusFilter } : statusFilter
        dataMatch.push({ status: statusValues })
      }

      if (query.document) {
        const keyword = escapeRegex(query.document.trim())
        dataMatch.push({
          $or: [{ documentId: { $regex: keyword, $options: "i" } }, { name: { $regex: keyword, $options: "i" } }],
        })
      }

      if (query.from && query.to) {
        const fromDate = DateTime.fromISO(query.from, { zone: "Asia/Bangkok" }).toUTC().toJSDate()
        const toDate = DateTime.fromISO(query.to, { zone: "Asia/Bangkok" }).toUTC().toJSDate()
        dataMatch.push({
          $and: [{ "dateRange.from": { $lte: toDate } }, { "dateRange.to": { $gte: fromDate } }],
        })
      }

      const finalDataMatch = dataMatch.length > 0 ? { $and: dataMatch } : {}
      const finalBaseMatch = baseMatch.length > 0 ? { $and: baseMatch } : {}
      let statusOrderLogic: Record<string, unknown> = {}
      if (statusFilter === "ALL" || !statusFilter) {
        statusOrderLogic = {
          $switch: {
            branches: [
              {
                case: {
                  $in: [STATUS.WAITING_PLANNER_COST_ANALYSIS, "$status"],
                },
                // oxlint-disable-next-line unicorn/no-thenable
                then: 1,
              },
              {
                case: { $in: [STATUS.COMPLETED, "$status"] },
                // oxlint-disable-next-line unicorn/no-thenable
                then: 2,
              },
            ],
            default: 3,
          },
        }
      }

      const results = await Planner.aggregate([
        {
          $facet: {
            data: [
              { $match: finalDataMatch },
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
            filteredCount: [{ $match: finalDataMatch }, { $count: "count" }],
            allStatusStats: [{ $match: finalBaseMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }],
          },
        },
      ])

      const facetResult = results[0]
      const planners = facetResult.data || []
      const totalFiltered = facetResult.filteredCount[0]?.count || 0
      const statusStats = facetResult.allStatusStats || []
      const totalPages = Math.ceil(totalFiltered / limit)

      const getCount = (targetStatus: string) => {
        let totalCount = 0
        statusStats.forEach((s: any) => {
          if (Array.isArray(s._id)) {
            if (s._id.includes(targetStatus)) {
              totalCount += s.count
            }
          } else {
            if (s._id === targetStatus) {
              totalCount += s.count
            }
          }
        })
        return totalCount
      }

      const totalAll = statusStats.reduce((acc: number, curr: any) => acc + curr.count, 0)

      const statusCountsResponse = {
        total: totalAll,
        waitingPlannerCostAnalysis: getCount(STATUS.WAITING_PLANNER_COST_ANALYSIS),
        completed: getCount(STATUS.COMPLETED),
      }

      if (planners.length === 0) {
        return {
          total: totalFiltered,
          totalPages: totalPages,
          statusCounts: statusCountsResponse,
          planners: [],
        }
      }
      const allUserIds = new Set<string>()

      planners.forEach((p: any) => {
        if (p.createdBy) {
          allUserIds.add(p.createdBy)
        }
        if (p.estimatedApproval?.approvedBy) {
          allUserIds.add(p.estimatedApproval.approvedBy)
        }
        if (p.actualApproval?.approvedBy) {
          allUserIds.add(p.actualApproval.approvedBy)
        }
      })

      const users = await User.find({ accountId: { $in: [...allUserIds] } })
        .select("accountId fullName")
        .lean()

      const userMap = new Map(users.map((u) => [u.accountId, u]))

      const mappedPlanners = planners.map((planner: any) => ({
        name: planner.name,
        documentId: planner.documentId,
        dateRange: {
          from: safeDate(planner.dateRange?.from),
          to: safeDate(planner.dateRange?.to),
        },
        objectives: planner.objectives,
        expectedOutcomes: planner.expectedOutcomes,
        locations: planner.locations?.map((loc: typeof PlannerModel.location.static) => ({
          name: loc.name,
          addressNo: loc.addressNo,
          village: loc.village,
          soi: loc.soi,
          street: loc.street,
          province: loc.province,
          district: loc.district,
          subdistrict: loc.subdistrict,
          zipcode: loc.zipcode,
          participants: loc.participants,
          dateRange: {
            from: safeDate(new Date(loc.dateRange?.from || "")),
            to: safeDate(new Date(loc.dateRange?.to || "")),
          },
        })),
        projectName: planner.projectName,
        participants: sortParticipantMonths(planner.participants),
        jvs: planner.jvs,
        estimatedBudget: planner.estimatedBudget,
        outcome: planner.outcome,
        actualBudget: planner.actualBudget,
        status: planner.status,
        createdBy: formatUser(planner.createdBy, userMap),
        estimatedApproval: {
          approvedBy: formatUser(planner.estimatedApproval?.approvedBy, userMap),
          approvedAt: safeDateTime(planner.estimatedApproval?.approvedAt),
        },
        actualApproval: {
          approvedBy: formatUser(planner.actualApproval?.approvedBy, userMap),
          approvedAt: safeDateTime(planner.actualApproval?.approvedAt),
        },
        worthiness: planner.worthiness,
        allowance: planner.allowance,
        allowanceClaimed: planner.allowanceClaimed,
      }))

      return {
        total: totalFiltered,
        totalPages: totalPages,
        statusCounts: statusCountsResponse,
        planners: mappedPlanners,
      }
    } catch (error) {
      console.error("Error fetching all planners:", error)
      throw error
    }
  }

  public static async getPlannerByDocumentId(documentId: string) {
    try {
      const planner = await Planner.findOne({
        documentId: documentId,
        status: {
          $in: [STATUS.WAITING_PLANNER_COST_ANALYSIS, STATUS.COMPLETED],
        },
      }).lean()

      if (!planner) {
        return null
      }
      const creator = await User.findOne({ accountId: planner.createdBy }).select("accountId fullName").lean()

      return {
        name: planner.name,
        documentId: planner.documentId,
        dateRange: {
          from: safeDate(planner.dateRange?.from),
          to: safeDate(planner.dateRange?.to),
        },
        objectives: planner.objectives,
        expectedOutcomes: planner.expectedOutcomes,
        locations: planner.locations,
        projectName: planner.projectName,
        participants: sortParticipantMonths(planner.participants),
        jvs: planner.jvs,
        estimatedBudget: planner.estimatedBudget,
        outcome: planner.outcome,
        actualBudget: planner.actualBudget,
        status: planner.status,
        createdBy: creator ? { accountId: creator.accountId, name: creator.fullName } : null,
        estimatedApproval: {
          approvedBy: planner.estimatedApproval?.approvedBy || null,
          approvedAt: safeDateTime(planner.estimatedApproval?.approvedAt),
        },
        actualApproval: {
          approvedBy: planner.actualApproval?.approvedBy || null,
          approvedAt: safeDateTime(planner.actualApproval?.approvedAt),
        },
        worthiness: planner.worthiness,
        allowance: planner.allowance,
        allowanceClaimed: planner.allowanceClaimed,
      }
    } catch (error) {
      console.error("Error fetching planner by documentId:", error)
      throw error
    }
  }

  public static async insertWorth(
    documentId: string,
    worthiness: string,
    reason: string,
    hasFile: boolean,
    files: worthinessModel.worthFileType[]
  ) {
    try {
      const planner = await Planner.findOne({ documentId }).lean()
      if (!planner) {
        throw new Error("Planner not found")
      }

      const statusPlanner: PlannerStatus[] = planner.status.map((s) => s)
      const newStatus = moveStatusForward(
        statusPlanner,
        PLANNER_ACTIONS.PLANNER_ANALYSIS_DONE,
        STATUS.WAITING_PLANNER_COST_ANALYSIS
      )

      const updatedPlanner = await Planner.findOneAndUpdate(
        { documentId },
        {
          $set: {
            worthiness: {
              worthiness: worthiness,
              reason: reason,
              hasFile: hasFile,
              files: files,
            },
            status: newStatus,
          },
        },
        { new: true }
      )

      return updatedPlanner?.toObject() ?? null
    } catch (error) {
      console.error("Error updating worth:", error)
      throw error
    }
  }
}
