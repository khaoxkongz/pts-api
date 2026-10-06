import { status } from "elysia"
import * as fs from "node:fs"
import * as path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import slug from "slug"
import { v7 } from "uuid"

import type * as PlannerModel from "@/modules/planner/model.js"

import { Planner, type TPlanner } from "@/models/planner.js"
import { User } from "@/models/user.js"
import { mapPlannerForView } from "@/modules/jv/service.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import * as UserProvider from "@/modules/user/provider.js"
import { userSubordinatesCache } from "@/plugins/cache.js"
import { calculateActualCostRatio } from "@/utils/actualCost/actualCostRatio.js"
import { sortParticipantMonths } from "@/utils/participant-months.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS, WAITING_STATUSES } from "@/utils/status/status.js"

import { type MemberType } from "../user/type.js"
import { type QueriesGAPlannersType } from "./model.js"
import { buildGaQueryMatches, buildStatusOrderLogic } from "./query-builder.js"
import { getGaDashboardData } from "./store.js"
import { calculateJvRatios, formatUser, getStatusCount, getStatusCounts, safeDate, safeDateTime } from "./utils.js"
const publicDir = path.join(process.cwd(), "upload")

export async function processActualBudgetFiles(
  documentId: string,
  items: (typeof PlannerModel.actualBudgetItem.static)[],
  files: File[] | undefined | null
) {
  const actualBudgetMaps = []
  let actualBudgetFileCursor = 0

  for (const item of items) {
    const actualBudgetFiles = []

    const baseItem = {
      by: "ga",
      type: item.type,
      name: item.name,
      price: item.price,
      remark: item.remark,
      sharedWith: item.sharedWith.map((user) => ({
        accountId: user.accountId,
        employeeId: user.employeeId,
        fullNameTh: user.fullNameTh,
      })),
    }

    if (item.hasFile && item.fileCount) {
      for (let i = 0; i < item.fileCount; i += 1) {
        const file = files?.[actualBudgetFileCursor]
        actualBudgetFileCursor += 1

        if (!file) {
          continue
        }

        actualBudgetFiles.push(file)
      }
    }

    const filesData = []

    for (const file of actualBudgetFiles) {
      const { filename, uuid, size, type } = await saveFile(file, documentId, publicDir)

      filesData.push({
        name: file.name,
        size: size,
        type: type,
        url: `budget-control/${documentId}/ga/${filename}`,
        uuid,
        createdBy: "",
      })
    }

    actualBudgetMaps.push({
      ...baseItem,
      hasFile: true,
      files: filesData,
    })
  }

  return actualBudgetMaps
}

export async function confirmEstimate(documentId: string, accountId: string) {
  const planner = await Planner.findOne({ documentId })
  if (!planner) {
    return status(400, {
      success: false,
      message: "ไม่พบเลขที่เอกสารที่ระบุ",
    })
  }

  try {
    const plannerBefore = planner.toObject()
    const statusPlanner = planner.status.map((s) => s)
    const newStatus = moveStatusForward(statusPlanner, PLANNER_ACTIONS.GA_ESTIMATE_DONE, STATUS.WAITING_GA_ESTIMATE)

    planner.status = newStatus
    planner.estimatedApproval.approvedBy = accountId
    planner.estimatedApproval.approvedAt = new Date()
    await planner.save()
    await workflowEventDispatcher
      .dispatch({
        type: "GA_ESTIMATE_CONFIRMED",
        payload: {
          plannerBefore,
          plannerAfter: planner.toObject(),
        },
        meta: {
          actorAccountId: accountId,
        },
      })
      .catch((error) => {
        console.error("Failed to record GA estimate workflow event:", error)
      })
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ",
    })
  }
  return {
    success: true,
    message: "ยืนยันการตรวจสอบประมาณการค่าใช้จ่ายสำเร็จ",
  }
}

export async function confirmActualBudget(documentId: string, accountId: string) {
  const planner = await Planner.findOne({ documentId })
  if (!planner) {
    return status(400, {
      success: false,
      message: "ไม่พบเลขที่เอกสารที่ระบุ",
    })
  }

  try {
    const plannerBefore = planner.toObject()
    const statusPlanner = planner.status.map((s) => s)
    const newStatus = moveStatusForward(statusPlanner, PLANNER_ACTIONS.GA_ACTUAL_DONE, STATUS.WAITING_GA_ACTUAL_COST)

    planner.status = newStatus
    planner.actualApproval.approvedBy = accountId
    planner.actualApproval.approvedAt = new Date()
    if (newStatus.includes(STATUS.GA_COMPLETED)) {
      try {
        const ratios = calculateActualCostRatio(planner.actualBudget, planner.jvs, planner.allowanceClaimed)

        ratios.forEach((ratio, idx) => {
          const jv = planner.jvs[idx]
          if (!jv) {
            return
          }

          jv.actualPercentageRatio = ratio.actualPercentageRatio
          jv.actualExpenseRatio = ratio.actualExpenseRatio
        })
      } catch (error) {
        return status(500, {
          success: false,
          message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการคำนวณสัดส่วนค่าใช้จ่ายจริงของ JV",
        })
      }
    }
    await planner.save()

    const plannerAfter = planner.toObject()

    await workflowEventDispatcher
      .dispatch({
        type: "GA_ACTUAL_CONFIRMED",
        payload: {
          plannerBefore,
          plannerAfter,
        },
        meta: {
          actorAccountId: accountId,
        },
      })
      .catch((error) => {
        console.error("Failed to record GA actual workflow event:", error)
      })

    if (
      !plannerBefore.status.includes(STATUS.WAITING_PLANNER_COST_ANALYSIS) &&
      plannerAfter.status.includes(STATUS.WAITING_PLANNER_COST_ANALYSIS)
    ) {
      await workflowEventDispatcher
        .dispatch({
          type: "PLANNER_READY_FOR_ANALYSIS",
          payload: {
            plannerBefore,
            plannerAfter,
          },
          meta: {
            actorAccountId: accountId,
            triggerAction: "GA_ACTUAL_DONE",
          },
        })
        .catch((error) => {
          console.error("Failed to record planner ready for analysis workflow event:", error)
        })
    }
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ",
    })
  }
  return {
    success: true,
    message: "ยืนยันการตรวจสอบงบประมาณที่ใช้จริงสำเร็จ",
  }
}

export async function updateEstimate(
  documentId: string,
  estimatedBudget: (typeof PlannerModel.estimatedBudget.static)[]
) {
  const planner = await Planner.findOne({ documentId }).lean()
  if (!planner) {
    return status(400, {
      success: false,
      message: "ไม่พบเลขที่เอกสารที่ระบุ",
    })
  }

  try {
    await Planner.updateOne(
      { documentId },
      {
        $set: {
          estimatedBudget,
        },
      }
    )

    return status(200, {
      success: true,
      message: "อัปเดตประมาณการค่าใช้จ่ายสำเร็จ",
    })
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตประมาณการค่าใช้จ่าย",
    })
  }
}

export async function updateJVExpenseAndPercentage(
  documentId: string,
  estimatedBudget: (typeof PlannerModel.estimatedBudget.static)[]
) {
  try {
    const planner = await Planner.findOne({ documentId }).lean()
    if (!planner) {
      return status(400, {
        success: false,
        message: "ไม่พบเลขที่เอกสารที่ระบุ",
      })
    }

    const updatedJvs = calculateJvRatios(planner.jvs, estimatedBudget, planner.estimatedBudget, planner.allowance)

    await Planner.updateOne(
      { documentId },
      {
        $set: {
          jvs: updatedJvs,
        },
      }
    )

    return status(200, {
      success: true,
      message: "อัปเดตค่าใช้จ่าย JV สำเร็จ",
    })
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตค่าใช้จ่าย JV",
    })
  }
}

export async function checkDefaultPlanner(me: { userId: string[]; role: string; isSupervisor: boolean }) {
  if (me.isSupervisor) {
    return {
      success: true,
      message: "หัวหน้างานค่าเริ่มต้นอยู่ที่ทั้งหมด",
      default: "ALL",
    }
  }
  if (me.role === "GM") {
    return {
      success: true,
      message: "ผู้มีสิทธิ์อนุมัติค่าใช้จ่ายของ JV",
      default: STATUS.WAITING_JV_APPROVAL,
    }
  }
  if (me.role !== "GA") {
    return {
      success: true,
      message: "ค่าเริ่มต้นอยู่ที่ทั้งหมด",
      default: "ALL",
    }
  }

  const [countGaEstimate, countGaActual] = await Promise.all([
    Planner.countDocuments({ status: { $eq: STATUS.WAITING_GA_ESTIMATE } }),
    Planner.countDocuments({ status: { $eq: STATUS.WAITING_GA_ACTUAL_COST } }),
  ])

  if (countGaEstimate > 0) {
    return {
      success: true,
      message: "มีแผนงานที่รอการตรวจสอบประมาณการค่าใช้จ่าย",
      default: STATUS.WAITING_GA_ESTIMATE,
    }
  } else if (countGaActual > 0) {
    return {
      success: true,
      message: "มีแผนงานที่รอการตรวจสอบงบประมาณที่ใช้จริง",
      default: STATUS.WAITING_GA_ACTUAL_COST,
    }
  }

  return {
    success: true,
    message: "ไม่มีแผนงานที่รอการตรวจสอบ",
    default: "ALL",
  }
}

export async function getPlannerByDocumentId(
  documentId: string,
  me: { userId: string[]; role: string; isSupervisor: boolean }
) {
  let subordinateIds: string[] = []
  if (me.isSupervisor) {
    subordinateIds = (await getSubordinateIds(me.userId)) || []
  }

  const planner = await Planner.findOne({
    documentId,
    status: { $nin: [STATUS.DRAFT] },
    $or: [
      { createdByEmployeeId: me.isSupervisor ? { $in: subordinateIds } : { $exists: true } },
      { "participants.employeeId": me.isSupervisor ? { $in: subordinateIds } : { $exists: true } },
      { "jvs.approversList.employeeId": me.role === "GM" ? { $in: [me.userId] } : { $exists: true } },
    ],
  }).lean()

  if (!planner) {
    return null
  }

  const plannerWithMappedJvs = await mapPlannerForView(planner)
  if (!plannerWithMappedJvs || Array.isArray(plannerWithMappedJvs)) {
    throw new Error("Failed to map planner for view")
  }

  const creator = await User.findOne({ accountId: planner.createdBy }).lean()

  return {
    name: planner.name,
    documentId: planner.documentId,
    dateRange: {
      from: safeDate(planner.dateRange?.from),
      to: safeDate(planner.dateRange?.to),
    },
    objectives: planner.objectives,
    expectedOutcomes: planner.expectedOutcomes,
    projectName: planner.projectName,
    locations: planner.locations,
    participants: sortParticipantMonths(planner.participants),
    jvs: plannerWithMappedJvs.jvs,
    estimatedBudget: planner.estimatedBudget,
    outcome: planner.outcome,
    actualBudget: planner.actualBudget,
    status: planner.status,
    createdBy: creator ? { accountId: creator.accountId, name: creator.fullName } : null,
    worthiness: planner.worthiness,
    allowance: planner.allowance,
    allowanceClaimed: planner.allowanceClaimed,
    cancellation: planner.cancellation
      ? {
          reason: planner.cancellation.reason,
          cancelledBy: planner.cancellation.cancelledBy,
          cancelledAt: planner.cancellation.cancelledAt.toISOString(),
          previousStatuses: planner.cancellation.previousStatuses ?? [],
        }
      : null,
  }
}

export async function getAllPlanners(
  me: { userId: string[]; role: string; isSupervisor: boolean; companyName: string[] },
  query: QueriesGAPlannersType
) {
  const limit = query.pageSize || 6
  const skip = ((query.page || 1) - 1) * limit

  let subordinateIds: string[] = []
  if (me.isSupervisor) {
    subordinateIds = (await getSubordinateIds(me.userId)) || []
  }

  const { finalDataMatch, finalBaseMatch } = buildGaQueryMatches(me, query, subordinateIds)
  const statusOrderLogic = buildStatusOrderLogic(me.role)

  const facetResult = await getGaDashboardData(finalDataMatch, finalBaseMatch, statusOrderLogic, skip, limit)

  const planners = (facetResult?.data || []) as TPlanner[]
  const totalFiltered = facetResult?.filteredCount[0]?.count || 0
  const statusStats = (facetResult?.allStatusStats || []) as { _id: string; count: number }[]
  const totalPages = Math.ceil(totalFiltered / limit)

  const totalAll = statusStats.reduce((acc, curr) => acc + curr.count, 0)

  const mappedPlanners = await mapPlannerData(planners)

  return {
    total: totalFiltered,
    totalPages: totalPages,
    statusCounts: {
      total: totalAll,
      waitingGaEstimate: getStatusCount(statusStats, STATUS.WAITING_GA_ESTIMATE),
      waitingGaActualCost: getStatusCount(statusStats, STATUS.WAITING_GA_ACTUAL_COST),
      waitingJVApproval: getStatusCount(statusStats, STATUS.WAITING_JV_APPROVAL),
      jvApproved: getStatusCount(statusStats, STATUS.JV_APPROVED),
      jvRejected: getStatusCount(statusStats, STATUS.JV_REJECTED),
      waitingEmpSummary: getStatusCount(statusStats, STATUS.WAITING_EMP_SUMMARY),
      waitingClaimAllowance: getStatusCount(statusStats, STATUS.WAITING_CLAIM_ALLOWANCE),
      completed: getStatusCount(statusStats, STATUS.GA_COMPLETED),
      waitingPlannerCostAnalysis: getStatusCount(statusStats, STATUS.WAITING_PLANNER_COST_ANALYSIS),
      plannerCostAnalyzed: getStatusCount(statusStats, STATUS.COMPLETED),
      waiting: getStatusCounts(statusStats, WAITING_STATUSES),
      cancelled: getStatusCount(statusStats, STATUS.CANCELLED),
    },
    data: mappedPlanners,
  }
}

export async function updateGaActualBudget(
  documentId: string,
  actualBudget: (typeof PlannerModel.actualBudget.static)[]
) {
  const planner = await Planner.findOne({ documentId })
  if (!planner) {
    return status(400, { success: false, message: "ไม่พบเลขที่เอกสารที่ระบุ" })
  }

  try {
    await planner.updateOne({
      $push: {
        actualBudget: {
          $each: actualBudget.map((item) => ({
            by: item.by,
            type: item.type,
            name: item.name,
            price: item.price,
            sharedWith: item.sharedWith,
            hasFile: item.hasFile,
            files: item.files,
            remark: item.remark,
          })),
        },
      },
    })

    return status(200, {
      success: true,
      message: "อัปเดตงบประมาณที่ใช้จริงสำเร็จ",
    })
  } catch {
    return status(500, {
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตงบประมาณที่ใช้จริง",
    })
  }
}

// ================= Helpers =================

async function saveFile(file: File, documentId: string, publicDir: string) {
  const uploadDir = path.join(publicDir, documentId, "ga")
  fs.mkdirSync(uploadDir, { recursive: true })

  const uuid = v7()
  const ext = path.extname(file.name)
  const nameWithoutExt = path.basename(file.name, ext)
  const filename = `${uuid}_${slug(nameWithoutExt, "-")}${ext}`
  const filePath = path.join(uploadDir, filename)

  const sourceStream = Readable.fromWeb(file.stream())
  const destStream = fs.createWriteStream(filePath)
  await pipeline(sourceStream, destStream)

  return {
    filename,
    uuid,
    size: file.size,
    type: file.type,
  }
}

async function getSubordinateIds(userIds: string[]) {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const cacheKey = `subordinates_${id}`
      const cached = userSubordinatesCache.get(cacheKey)
      if (cached) {
        return cached as string[]
      }

      const subordinates: MemberType[] = await UserProvider.getUserSubordinatesByLeaderId(id)
      const ids = subordinates.map((s) => s.employeeId)
      userSubordinatesCache.set(cacheKey, ids)
      return ids
    })
  )

  return results.flat()
}

async function mapPlannerData(planners: TPlanner[]) {
  const allUserIds = new Set<string>()

  for (const p of planners) {
    if (p.createdBy) {
      allUserIds.add(p.createdBy)
    }
    if (p.estimatedApproval?.approvedBy) {
      allUserIds.add(p.estimatedApproval.approvedBy)
    }
    if (p.actualApproval?.approvedBy) {
      allUserIds.add(p.actualApproval.approvedBy)
    }
  }

  const users = await User.find({ accountId: { $in: [...allUserIds] } })
    .select({ accountId: 1, fullName: 1 })
    .lean()

  const userMap = new Map(users.map((u) => [u.accountId, u]))

  return planners.map((planner) => ({
    name: planner.name,
    documentId: planner.documentId,
    dateRange: {
      from: safeDate(planner.dateRange?.from),
      to: safeDate(planner.dateRange?.to),
    },
    objectives: planner.objectives,
    expectedOutcomes: planner.expectedOutcomes,
    locations: planner.locations?.map((loc) => ({
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
      approvedBy: formatUser(planner.estimatedApproval?.approvedBy || "", userMap),
      approvedAt: safeDateTime(planner.estimatedApproval?.approvedAt),
    },
    actualApproval: {
      approvedBy: formatUser(planner.actualApproval?.approvedBy || "", userMap),
      approvedAt: safeDateTime(planner.actualApproval?.approvedAt),
    },
    allowance: planner.allowance,
    allowanceClaimed: planner.allowanceClaimed,
    cancellation: planner.cancellation
      ? {
          reason: planner.cancellation.reason,
          cancelledBy: planner.cancellation.cancelledBy,
          cancelledAt: planner.cancellation.cancelledAt.toISOString(),
          previousStatuses: planner.cancellation.previousStatuses ?? [],
        }
      : null,
  }))
}
