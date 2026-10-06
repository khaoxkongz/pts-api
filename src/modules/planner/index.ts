import { Elysia, t } from "elysia"
import * as fs from "node:fs"
import * as path from "node:path"

import { Counter } from "@/models/counter.js"
import { EmployeeRA } from "@/models/employee-ra.js"
import { Planner } from "@/models/planner.js"
import { workflowEventDispatcher } from "@/modules/notification/runtime.js"
import { session } from "@/plugins/session.js"
import { calculateActualCostRatio } from "@/utils/actualCost/actualCostRatio.js"
import { moveStatusForward } from "@/utils/status/status-helper.js"
import { PLANNER_ACTIONS, STATUS } from "@/utils/status/status.js"

import { getAddressData } from "./address-logic.js"
import { calculatePlannedAllowance } from "./allowance-logic.js"
import * as PlannerModel from "./model.js"
import * as PlannerService from "./service.js"
import { getMime, processActualBudgetFiles, processOutcomeFiles } from "./utils.js"

const publicDir = path.join(process.cwd(), "upload")
fs.mkdirSync(publicDir, { recursive: true })

export const planner = new Elysia({ prefix: "/planner" })
  .use(session)

  .get(
    "",
    async ({ query, user, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          })
        }

        const { planners, totalCount, totalPages } = await PlannerService.getPlannerList(user, query)

        return status(200, {
          success: true,
          message: "ส่งข้อมูล planner ให้แล้ว",
          page: query.page,
          pageSize: query.pageSize,
          totalCount,
          totalPages,
          data: planners,
        })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      query: PlannerModel.queriesPlanner,
      detail: {
        description: "ใช้สำหรับดูข้อมูลของแผนงานทั้งหมดที่เกี่ยวข้องกับผู้สร้างและผู้มีส่วนร่วมในแผนงาน",
        tags: ["Planner"],
      },
    }
  )

  .get(
    ":documentId",
    async ({ params, user, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          })
        }

        const plannerDetail = await PlannerService.getPlannerDetail(user, params.documentId)

        if (!plannerDetail) {
          return status(404, {
            success: false,
            message: "ไม่พบข้อมูลที่ร้องขอภายในระบบ",
          })
        }

        return status(200, {
          success: true,
          message: "ส่งข้อมูล planner ให้แล้ว",
          data: plannerDetail,
        })
      } catch {
        return status(500, {
          success: false,
          message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
        })
      }
    },
    {
      isAuth: true,
      params: t.Object({
        documentId: t.String({ examples: "เลขที่เอกสารของแผนงานที่ต้องการดูข้อมูล" }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: PlannerModel.planner,
        }),
        401: PlannerModel.authorizedError,
        404: PlannerModel.notFoundError,
        500: PlannerModel.internalServerError,
      },
      detail: {
        description: "ใช้สำหรับดูข้อมูลของแผนงาน โดยใช้เลขที่เอกสารของแผนงานที่ต้องการดูข้อมูล",
        tags: ["Planner"],
      },
    }
  )

  .post(
    "/:documentId/cancel",
    async ({ params, body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      try {
        const result = await PlannerService.cancelPlanner(user, params.documentId, body.reason)
        if (!result.success) {
          return status(result.status, { success: false, message: result.message })
        }
        return status(200, {
          success: true,
          message: result.message,
          previousStatuses: result.previousStatuses,
        })
      } catch (error) {
        console.error("Failed to cancel planner:", error)
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      params: t.Object({ documentId: t.String() }),
      body: PlannerModel.cancelPlannerBody,
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          previousStatuses: t.Array(PlannerModel.statusEnum),
        }),
        400: PlannerModel.badRequestError,
        401: PlannerModel.authorizedError,
        403: PlannerModel.authorizedError,
        404: PlannerModel.notFoundError,
        409: t.Object({ success: t.Boolean(), message: t.String() }),
        500: PlannerModel.internalServerError,
      },
      detail: {
        description: "ยกเลิกแผนงานโดยผู้สร้างแผนงาน",
        tags: ["Planner"],
      },
    }
  )

  .post(
    "",
    async ({ body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      try {
        const now = new Date()
        const year = now.getUTCFullYear() + 543
        const monthNum = now.getUTCMonth() + 1
        const month = String(monthNum).padStart(2, "0")
        const counterId = `planner_${year}_${month}`

        const counter = await Counter.findOneAndUpdate(
          { counterId: counterId },
          {
            $inc: { sequence: 1 },
            $setOnInsert: { year, month },
          },
          { new: true, upsert: true }
        ).lean()

        const seqStr = String(counter?.sequence).padStart(4, "0")

        const documentId = `${year}${month}${seqStr}`

        const createdByEmployeeIds = user.companies?.flatMap((c) => (c.employeeId ? [c.employeeId] : [])) ?? []

        const accountIds = new Set<string>()

        for (const p of body.participants) {
          accountIds.add(p.accountId)
        }

        for (const loc of body.locations) {
          for (const p of loc.participants ?? []) {
            accountIds.add(p.accountId)
          }
        }

        for (const jv of body.jvs) {
          for (const p of jv.approversList ?? []) {
            accountIds.add(p.accountId)
          }
        }

        const employees = await EmployeeRA.find({ accountId: { $in: [...accountIds] } }).lean()

        const employeeMap = new Map<string, string[]>()

        for (const emp of employees) {
          let list = employeeMap.get(emp.accountId)
          if (!list) {
            list = []
            employeeMap.set(emp.accountId, list)
          }
          list.push(emp.employeeId)
        }

        function attachEmployeeId<T extends { accountId: string }>(list: T[]): (T & { employeeId: string[] })[] {
          return list.map((p) => ({
            ...p,
            employeeId: employeeMap.get(p.accountId) ?? [],
          }))
        }

        body.participants = attachEmployeeId(body.participants)

        for (const loc of body.locations) {
          loc.participants = attachEmployeeId(loc.participants)
        }

        for (const jv of body.jvs) {
          jv.approversList = attachEmployeeId(jv.approversList)
        }

        const planner = new Planner({
          documentId: documentId,
          name: body.name,
          dateRange: {
            from: body?.dateRange?.from ? new Date(body.dateRange.from) : undefined,
            to: body?.dateRange?.to ? new Date(body.dateRange.to) : undefined,
          },
          objectives: body.objectives,
          expectedOutcomes: body.expectedOutcomes,
          projectName: body.projectName,
          locations: body.locations,
          participants: body.participants,
          jvs: body.jvs,
          estimatedBudget: body.estimatedBudget,
          status: body.status,
          createdBy: user.accountId,
          createdByEmployeeId: createdByEmployeeIds,
        })
        planner.allowance = calculatePlannedAllowance(planner.participants)
        await planner.save()

        if (!planner.status.includes("DRAFT")) {
          await workflowEventDispatcher
            .dispatch({
              type: "PLANNER_CREATED",
              payload: {
                planner: planner.toObject(),
              },
              meta: {
                actorAccountId: user.accountId,
              },
            })
            .catch((error) => {
              console.error("Failed to record planner created workflow event:", error)
            })
        }

        return status(201, { success: true, message: "สร้าง planner สำเร็จ" })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      body: PlannerModel.createPlanner,
      detail: {
        description: "ใช้สำหรับสร้างแผนงานใหม่",
        tags: ["Planner"],
      },
    }
  )

  .patch(
    ":documentId",
    async ({ params, body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      try {
        const editablePlanner = await PlannerService.getEditablePlanner(user, params.documentId)
        if (!editablePlanner.success) {
          const code = editablePlanner.status || 500
          return status(code, { success: false, message: editablePlanner.message || "เกิดข้อผิดพลาด" })
        }

        const accountIds = new Set<string>()

        for (const p of body.participants ?? []) {
          accountIds.add(p.accountId)
        }

        for (const loc of body.locations ?? []) {
          for (const p of loc.participants ?? []) {
            accountIds.add(p.accountId)
          }
        }

        for (const jv of body.jvs ?? []) {
          for (const p of jv.approversList ?? []) {
            accountIds.add(p.accountId)
          }
        }

        for (const e of body.estimatedBudget ?? []) {
          for (const s of e.sharedWith ?? []) {
            accountIds.add(s.accountId)
          }
        }

        const employees = await EmployeeRA.find({ accountId: { $in: [...accountIds] } }).lean()

        const employeeMap = new Map<string, string[]>()

        for (const emp of employees) {
          let list = employeeMap.get(emp.accountId)
          if (!list) {
            list = []
            employeeMap.set(emp.accountId, list)
          }
          list.push(emp.employeeId)
        }

        function attachEmployeeId<T extends { accountId: string }>(list: T[]): (T & { employeeId: string[] })[] {
          return list.map((p) => ({
            ...p,
            employeeId: employeeMap.get(p.accountId) ?? [],
          }))
        }

        if (body.participants !== undefined) {
          body.participants = attachEmployeeId(body.participants)
        }

        for (const loc of body.locations ?? []) {
          loc.participants = attachEmployeeId(loc.participants)
        }

        for (const jv of body.jvs ?? []) {
          jv.approversList = attachEmployeeId(jv.approversList)
        }

        for (const e of body.estimatedBudget ?? []) {
          e.sharedWith = attachEmployeeId(e.sharedWith ?? [])
        }

        const plannerBefore = editablePlanner.planner

        await PlannerService.updatePlannerByDocumentId(params.documentId, body)

        const plannerAfter = await Planner.findOne({ documentId: params.documentId })
        if (plannerAfter) {
          const wasDraft = plannerBefore.status.includes("DRAFT")
          const isNowWaitGA = plannerAfter.status.includes("WAITING_GA_ESTIMATE")

          if (wasDraft && isNowWaitGA) {
            await workflowEventDispatcher
              .dispatch({
                type: "PLANNER_CREATED",
                payload: {
                  planner: plannerAfter.toObject(),
                },
                meta: {
                  actorAccountId: user.accountId,
                },
              })
              .catch((error) => {
                console.error("Failed to record planner created workflow event:", error)
              })
          }
        }

        return status(200, { success: true, message: "แก้ไข planner สำเร็จ" })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      params: t.Object({
        documentId: t.String({ examples: "เลขที่เอกสารของแผนงานที่ต้องการดูข้อมูล" }),
      }),
      body: PlannerModel.partialUpdatePlanner,
      response: {
        200: t.Object({ success: t.Boolean(), message: t.String() }),
        400: t.Object({ success: t.Boolean(), message: t.String() }),
        401: PlannerModel.authorizedError,
        403: PlannerModel.authorizedError,
        404: PlannerModel.notFoundError,
        500: PlannerModel.internalServerError,
      },
      detail: {
        description: "ใช้สำหรับแก้ไขข้อมูลของแผนงาน",
        tags: ["Planner"],
      },
    }
  )

  .post(
    "/summaries/:documentId",
    async ({ params, body, user, status }) => {
      if (!user) {
        return status(401, { success: false, message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" })
      }

      let uploadDir = ""

      try {
        const planner = await Planner.findOne({
          documentId: params.documentId,
        })

        if (!planner) {
          return status(404, { success: false, message: "ข้อมูลที่ร้องขอไม่มีอยู่ในระบบ" })
        }

        const plannerBefore = planner.toObject()

        const outcomeFiles = await processOutcomeFiles(
          body.outcome,
          body.outcomeFiles,
          params.documentId,
          user.accountId,
          publicDir
        )

        const actualBudgetMaps = await processActualBudgetFiles(
          body.actualBudget.items,
          body.actualBudgetFiles,
          params.documentId,
          user.accountId,
          publicDir
        )

        const newStatus = moveStatusForward(
          planner.status,
          PLANNER_ACTIONS.EMP_SUMMARY_DONE,
          STATUS.WAITING_EMP_SUMMARY
        )

        const newPlanner = await Planner.findOneAndUpdate(
          { documentId: params.documentId },
          {
            $set: {
              status: newStatus,
              outcome: {
                keyAchievement: body.outcome.keyAchievement,
                issueAndChallenges: body.outcome.issueAndChallenges,
                additionalNotes: body.outcome.additionalNotes,
                supportingDocuments: outcomeFiles,
                hasFile: body.outcome.hasFile,
              },
            },
            $push: {
              actualBudget: {
                $each: actualBudgetMaps,
              },
            },
          },
          { new: true }
        )

        if (!newPlanner) {
          return status(404, {
            success: false,
            message: "ข้อมูลที่ร้องขอไม่มีอยู่ในระบบ",
          })
        }

        if (newStatus.includes(STATUS.GA_COMPLETED)) {
          try {
            const ratios = calculateActualCostRatio(
              newPlanner.actualBudget,
              newPlanner.jvs,
              newPlanner.allowanceClaimed
            )
            ratios.forEach((ratio, idx) => {
              const jv = newPlanner.jvs[idx]
              if (!jv) {
                return
              }

              jv.actualPercentageRatio = ratio.actualPercentageRatio
              jv.actualExpenseRatio = ratio.actualExpenseRatio
            })
            await newPlanner.save()
          } catch (error) {
            return status(500, {
              success: false,
              message: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการคำนวณสัดส่วนค่าใช้จ่ายจริงของ JV",
            })
          }
        }

        const plannerAfter = newPlanner.toObject()

        await workflowEventDispatcher
          .dispatch({
            type: "EMPLOYEE_SUMMARY_SUBMITTED",
            payload: {
              plannerBefore,
              plannerAfter,
            },
            meta: {
              actorAccountId: user.accountId,
            },
          })
          .catch((error) => {
            console.error("Failed to record employee summary workflow event:", error)
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
                actorAccountId: user.accountId,
                triggerAction: "EMP_SUMMARY_DONE",
              },
            })
            .catch((error) => {
              console.error("Failed to record planner ready for analysis workflow event:", error)
            })
        }

        return status(201, { success: true, message: "สร้าง planner สำเร็จ" })
      } catch {
        if (uploadDir) {
          await fs.promises.rm(uploadDir, { recursive: true, force: true })
        }

        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      params: t.Object({
        documentId: t.String({ examples: "เลขที่เอกสารของแผนงานที่ต้องการดูข้อมูล" }),
      }),
      body: PlannerModel.insertInputPlannerSummary,
      response: {
        201: t.Object({ success: t.Boolean(), message: t.String() }),
        401: PlannerModel.authorizedError,
        404: PlannerModel.notFoundError,
        500: PlannerModel.internalServerError,
      },
      detail: {
        description: "ใช้สำหรับสร้างแผนงานใหม่",
        tags: ["Planner"],
      },
    }
  )

  .get(
    "/pending-count",
    async ({ user, status }) => {
      try {
        if (!user) {
          return status(401, {
            success: false,
            message: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง",
          })
        }

        const [draftCount, waitingCount] = await Promise.all([
          Planner.countDocuments({
            status: "DRAFT",
            createdBy: user.accountId,
          }),
          Planner.countDocuments({
            status: "WAITING_EMP_SUMMARY",
            $or: [{ createdBy: user.accountId }, { "participants.accountId": user.accountId }],
          }),
        ])

        return status(200, {
          success: true,
          message: "ส่งข้อมูลจำนวนงานคงค้างสำเร็จ",
          data: {
            draftCount: draftCount,
            waitingEmpSummaryCount: waitingCount,
          },
        })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      isAuth: true,
      detail: {
        description: "ใช้สำหรับดูจำนวนแผนงานที่ต้องดำเนินการ",
        tags: ["Planner"],
      },
    }
  )

  .get(
    "address",
    ({ query, status }) => {
      try {
        const result = getAddressData(query)

        if (!result.success) {
          return status(result.status || 200, {
            success: false,
            message: result.message,
          })
        }

        return status(200, { success: true, result: result.result })
      } catch {
        return status(500, { success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
      }
    },
    {
      query: t.Object({
        provinceName: t.Optional(t.String()),
        districtName: t.Optional(t.String()),
        subdistrictName: t.Optional(t.String()),
      }),
      detail: {
        description: "API สำหรับ dropdown autocomplete จังหวัด อำเภอ ตำบล",
        tags: ["Planner"],
      },
    }
  )

  .get(
    "/:documentId/employee/:filename",
    ({ params, status, set }) => {
      const { documentId, filename } = params

      // กัน path traversal
      if (documentId.includes("..") || filename.includes("..")) {
        return status(400, { success: false, message: "ข้อมูลที่ร้องขอไม่ถูกต้อง" })
      }

      const filePath = path.join(publicDir, documentId, "employee", filename)
      if (!fs.existsSync(filePath)) {
        return status(404, { success: false, message: "File not found" })
      }

      set.headers["Content-Type"] = getMime(filename)
      set.headers["Content-Disposition"] = "inline"

      return fs.createReadStream(filePath)
    },
    {
      params: t.Object({ documentId: t.String(), filename: t.String() }),
      response: {
        400: PlannerModel.badRequestError,
        404: PlannerModel.notFoundError,
      },
      detail: {
        tags: ["Planner"],
      },
    }
  )
