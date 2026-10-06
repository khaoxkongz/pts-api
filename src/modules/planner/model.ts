import { t } from "elysia"

import { type TPlanner } from "@/models/planner.js"
import { rollupParticipantStatus } from "@/modules/participant/logic.js"
import { type ParticipantStatus } from "@/modules/webhook/logic.js"
import { byMonthAsc } from "@/utils/participant-months.js"

export const statusEnum = t.Union([
  t.Literal("DRAFT"),
  t.Literal("WAITING_GA_ESTIMATE"),
  t.Literal("WAITING_GA_ACTUAL_COST"),
  t.Literal("WAITING_JV_APPROVAL"),
  t.Literal("JV_APPROVED"),
  t.Literal("JV_REJECTED"),
  t.Literal("WAITING_EMP_SUMMARY"),
  t.Literal("WAITING_CLAIM_ALLOWANCE"),
  t.Literal("GA_COMPLETED"),
  t.Literal("WAITING_PLANNER_COST_ANALYSIS"),
  t.Literal("COMPLETED"),
  t.Literal("WAITING"),
  t.Literal("CANCELLED"),
])

export const jvStatusEnum = t.Union([
  t.Literal("WAITING_JV_APPROVAL"),
  t.Literal("JV_APPROVED"),
  t.Literal("JV_REJECTED"),
])

export const participantStatusEnum = t.Union([
  t.Literal("APPROVE"),
  t.Literal("REJECT"),
  t.Literal("CANCEL"),
  t.Literal("WAIT"),
  t.Literal("PENDING"),
  t.Literal("PENDING_REJECT"),
  t.Literal("PENDING_CANCEL"),
])

export const dateRange = t.Object({
  from: t.MaybeEmpty(t.String()),
  to: t.MaybeEmpty(t.String()),
})

export const approver = t.Object({
  employeeId: t.Array(t.String()),
  nameTh: t.String(),
  accountId: t.String(),
})

export const jvItem = t.Object({
  taxId: t.String(),
  companyFullNameTh: t.String(),
  companyFullNameEng: t.String(),
  approversList: t.Array(approver),
  expenseRatio: t.Number(),
  percentageRatio: t.Number(),
  actualExpenseRatio: t.Number(),
  actualPercentageRatio: t.Number(),
  status: t.Union([jvStatusEnum], { default: "WAITING_JV_APPROVAL" }),
  rejectionReason: t.String(),
  confirmedBy: t.String(),
  confirmedAt: t.MaybeEmpty(t.Date()),
})

export const location = t.Object({
  name: t.String(),
  addressNo: t.String(),
  soi: t.String(),
  village: t.String(),
  street: t.String(),
  district: t.String(),
  province: t.String(),
  subdistrict: t.String(),
  zipcode: t.String(),
  participants: t.Array(approver),
  dateRange: dateRange,
})

export const sharedWith = t.Object({
  accountId: t.String(),
  employeeId: t.Array(t.String()),
  fullNameTh: t.String(),
})

export const estimatedBudget = t.Object({
  type: t.String(),
  name: t.Optional(t.Nullable(t.String())),
  price: t.Number(),
  sharedWith: t.Array(sharedWith),
  remark: t.Optional(t.String({ default: "" })),
})

export const outcome = t.Object({
  keyAchievement: t.String(),
  issueAndChallenges: t.String(),
  additionalNotes: t.String(),
})

export const file = t.Object({
  name: t.String(),
  size: t.Number(),
  type: t.String(),
  url: t.String(),
  uuid: t.String(),
  createdBy: t.String(),
})

export const actualBudget = t.Composite([
  estimatedBudget,
  t.Object({
    by: t.String(),
    hasFile: t.Boolean(),
    files: t.Array(file),
  }),
])

export const allowanceMonth = t.Object({
  month: t.String(),
  allowanceMonthly: t.Number(),
  allowanceDaily: t.Number(),
  allowanceDays: t.Number(),
  // allowanceRange: t.Object({
  //   from: t.String({ format: "date", default: "" }),
  //   to: t.String({ format: "date", default: "" }),
  // }),
  allowanceClaimed: t.Number(),
  allowanceAccum: t.Number(),
  allowanceRemaining: t.Number(),
  status: t.Optional(participantStatusEnum),
})

export const participant = t.Object({
  accountId: t.String(),
  employeeId: t.Array(t.String()),
  fullNameTh: t.String(),
  isAllowance: t.Boolean({ default: false }),
  status: t.Optional(participantStatusEnum),
  months: t.Optional(t.Array(allowanceMonth)),
  monthsClaimed: t.Optional(t.Array(allowanceMonth)),
})

export const cancellation = t.Object({
  reason: t.String(),
  cancelledBy: t.String(),
  cancelledAt: t.String(),
  previousStatuses: t.Array(statusEnum),
})

export const planner = t.Object({
  name: t.String(),
  documentId: t.String(),
  dateRange: dateRange,
  objectives: t.String(),
  expectedOutcomes: t.String(),
  projectName: t.String(),
  locations: t.Array(location),
  participants: t.Array(participant),
  jvs: t.Array(jvItem),
  estimatedBudget: t.Array(estimatedBudget),
  outcome: t.Composite([outcome, t.Object({ supportingDocuments: t.Array(file) })]),
  actualBudget: t.Array(actualBudget),
  createdBy: t.String(),
  createdByEmployeeId: t.Array(t.String()),
  status: t.Array(statusEnum),
  allowance: t.Number(),
  allowanceClaimed: t.Number(),
  cancellation: t.Optional(t.Nullable(cancellation)),
})

export const createPlanner = t.Object({
  name: t.String(),
  dateRange: dateRange,
  objectives: t.String(),
  expectedOutcomes: t.String(),
  projectName: t.String(),
  locations: t.Array(location),
  participants: t.Array(participant),
  jvs: t.Array(t.Pick(jvItem, ["taxId", "companyFullNameTh", "companyFullNameEng", "approversList"])),
  estimatedBudget: t.Array(estimatedBudget),
  status: t.Array(statusEnum),
})

export const partialUpdatePlanner = t.Partial(createPlanner)

export const cancelPlannerBody = t.Object({
  reason: t.String({ minLength: 1 }),
})

export const actualBudgetItem = t.Composite([
  t.Omit(actualBudget, ["by", "files"]),
  t.Object({
    fileCount: t.Optional(t.Number()),
  }),
])

export const insertInputPlannerSummary = t.Object({
  outcome: t.ObjectString({
    keyAchievement: t.String(),
    issueAndChallenges: t.String(),
    additionalNotes: t.String(),
    hasFile: t.Boolean(),
  }),
  outcomeFiles: t.Optional(t.Files()),
  actualBudget: t.ObjectString({
    items: t.Array(actualBudgetItem),
  }),
  actualBudgetFiles: t.Optional(t.Files()),
})

export const queriesPlanner = t.Object({
  page: t.Optional(t.Number({ default: 1 })),
  pageSize: t.Optional(t.Number({ default: 6 })),
  document: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  status: t.Optional(statusEnum),
})

export const authorizedError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "Cookie Token หมดอายุ หรือ ไม่ถูกต้อง" }),
})

export const badRequestError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "ข้อมูลที่ร้องขอไม่ถูกต้อง" }),
})

export const notFoundError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "ไม่พบข้อมูลที่ร้องขอภายในระบบ" }),
})

export const internalServerError = t.Object({
  success: t.Boolean({ examples: false }),
  message: t.String({ examples: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" }),
})

export function toPlannerDto(plannerData: TPlanner): typeof planner.static {
  return {
    name: plannerData.name,
    documentId: plannerData.documentId,
    createdBy: plannerData.createdBy,
    createdByEmployeeId: plannerData.createdByEmployeeId,
    dateRange: {
      from: plannerData.dateRange?.from?.toISOString() || "",
      to: plannerData.dateRange?.to?.toISOString() || "",
    },
    objectives: plannerData.objectives,
    expectedOutcomes: plannerData.expectedOutcomes,
    projectName: plannerData.projectName,
    allowance: plannerData.allowance,
    allowanceClaimed: plannerData.allowanceClaimed,
    cancellation: plannerData.cancellation
      ? {
          reason: plannerData.cancellation.reason,
          cancelledBy: plannerData.cancellation.cancelledBy,
          cancelledAt: plannerData.cancellation.cancelledAt.toISOString(),
          previousStatuses: plannerData.cancellation.previousStatuses ?? [],
        }
      : null,
    locations: plannerData.locations.map((location) => ({
      name: location.name,
      village: location.village,
      soi: location.soi,
      street: location.street,
      province: location.province,
      district: location.district,
      subdistrict: location.subdistrict,
      zipcode: location.zipcode,
      addressNo: location.addressNo,
      dateRange: {
        from: location.dateRange?.from?.toISOString() || "",
        to: location.dateRange?.to?.toISOString() || "",
      },
      participants: location.participants.map((participant) => ({
        accountId: participant.accountId,
        employeeId: participant.employeeId,
        nameTh: participant.nameTh,
      })),
    })),
    participants: plannerData.participants.map((p) => ({
      accountId: p.accountId,
      employeeId: p.employeeId,
      fullNameTh: p.fullNameTh,
      isAllowance: p.isAllowance,
      // Only allowance claimers carry an allowance-lifecycle status. Non-claimers default to the
      // schema "PENDING" but are never in the lifecycle, so omit it rather than show รอดำเนินการเบี้ยเลี้ยง.
      status: p.isAllowance ? (rollupParticipantStatus(p) as ParticipantStatus) : undefined,
      months: [...(p.months ?? [])]
        .sort((a, b) => (a.month ?? "").localeCompare(b.month ?? ""))
        .map((month) => ({
          month: month.month,
          allowanceMonthly: month.allowanceMonthly,
          allowanceDaily: month.allowanceDaily,
          allowanceDays: month.allowanceDays,
          // allowanceRange: {
          //   from: month.allowanceRange?.from?.toISOString() ?? "",
          //   to: month.allowanceRange?.to?.toISOString() ?? "",
          // },
          allowanceClaimed: month.allowanceClaimed,
          allowanceAccum: month.allowanceAccum,
          allowanceRemaining: month.allowanceRemaining,
        })),
      // Raw claimed ledger, one row per (month, transaction_id), month-then-transaction_id sorted
      // to match the GA page (ga/service.ts uses sortParticipantMonths -> byMonthAsc). No collapse
      // and no APPROVE-only summing: each entry's stored allowanceClaimed and status are shown as-is.
      monthsClaimed: byMonthAsc(p.monthsClaimed).map((month) => ({
        month: month.month,
        allowanceMonthly: month.allowanceMonthly,
        allowanceDaily: month.allowanceDaily,
        allowanceDays: month.allowanceDays,
        allowanceClaimed: month.allowanceClaimed,
        allowanceAccum: month.allowanceAccum,
        allowanceRemaining: month.allowanceRemaining,
        status: month.status ? (month.status as ParticipantStatus) : undefined,
      })),
    })),
    jvs: plannerData.jvs.map((j) => ({
      taxId: j.taxId,
      companyFullNameTh: j.companyFullNameTh,
      companyFullNameEng: j.companyFullNameEng,
      approversList: j.approversList.map((a) => ({
        employeeId: a.employeeId,
        nameTh: a.nameTh,
        accountId: a.accountId,
      })),
      expenseRatio: j.expenseRatio,
      percentageRatio: j.percentageRatio,
      actualExpenseRatio: j.actualExpenseRatio,
      actualPercentageRatio: j.actualPercentageRatio,
      status: j.status,
      rejectionReason: j.rejectionReason,
      confirmedBy: j.confirmedBy,
      confirmedAt: j.confirmedAt,
    })),
    estimatedBudget: plannerData.estimatedBudget.map((e) => ({
      type: e.type,
      name: e.name,
      price: e.price,
      sharedWith: e.sharedWith.map((s) => ({
        accountId: s.accountId,
        employeeId: s.employeeId,
        fullNameTh: s.fullNameTh,
      })),
      remark: e.remark,
    })),
    outcome: {
      keyAchievement: plannerData.outcome.keyAchievement,
      issueAndChallenges: plannerData.outcome.issueAndChallenges,
      additionalNotes: plannerData.outcome.additionalNotes,
      supportingDocuments: plannerData.outcome.supportingDocuments,
    },
    actualBudget: plannerData.actualBudget.map((a) => ({
      by: a.by,
      type: a.type,
      name: a.name,
      price: a.price,
      remark: a.remark,
      sharedWith: a.sharedWith.map((s) => ({
        accountId: s.accountId,
        employeeId: s.employeeId,
        fullNameTh: s.fullNameTh,
      })),
      hasFile: a.hasFile,
      files: a.files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url,
        uuid: file.uuid,
        createdBy: file.createdBy,
      })),
    })),
    status: plannerData.status,
  }
}
