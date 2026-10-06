import { model, Schema, type InferRawDocTypeFromSchema } from "mongoose"

const daterangeSchema = new Schema(
  {
    from: { type: Date },
    to: { type: Date },
  },
  { _id: false }
)

const approver = new Schema(
  {
    employeeId: { type: [String], default: "" },
    nameTh: { type: String, default: "" },
    accountId: { type: String, default: "" },
  },
  { _id: false }
)

const jvSchema = new Schema(
  {
    taxId: { type: String, default: "" },
    companyFullNameTh: { type: String, default: "" },
    companyFullNameEng: { type: String, default: "" },
    approversList: { type: [approver], default: [] },
    percentageRatio: { type: Number, default: 0 },
    expenseRatio: { type: Number, default: 0 },
    actualPercentageRatio: { type: Number, default: 0 },
    actualExpenseRatio: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["WAITING_JV_APPROVAL", "JV_APPROVED", "JV_REJECTED"],
      default: "WAITING_JV_APPROVAL",
    },
    rejectionReason: { type: String, default: "" },
    confirmedBy: { type: String, default: "" },
    confirmedAt: { type: Date },
  },
  { _id: false }
)

const locationSchema = new Schema(
  {
    name: { type: String, default: "" },
    addressNo: { type: String, default: "" },
    village: { type: String, default: "" },
    soi: { type: String, default: "" },
    street: { type: String, default: "" },
    province: { type: String, default: "" },
    district: { type: String, default: "" },
    subdistrict: { type: String, default: "" },
    zipcode: { type: String, default: "" },
    participants: { type: [approver], default: [] },
    dateRange: {
      type: daterangeSchema,
      default: { from: new Date(), to: new Date() },
    },
  },
  { _id: false }
)

const sharedWithSchema = new Schema(
  {
    accountId: { type: String, default: "" },
    employeeId: { type: [String], default: "" },
    fullNameTh: { type: String, default: "" },
  },
  { _id: false }
)

const fileSchema = new Schema(
  {
    name: { type: String, default: "" },
    size: { type: Number, default: 0 },
    type: { type: String, default: "" },
    url: { type: String, default: "" },
    uuid: { type: String, default: "" },
    createdBy: { type: String, default: "" },
  },
  { _id: false }
)

const estimatedBudgetSchema = new Schema(
  {
    type: { type: String, default: "" },
    name: { type: String, default: "" },
    price: { type: Number, default: 0 },
    sharedWith: { type: [sharedWithSchema], default: [] },
    remark: { type: String, default: "" },
  },
  { _id: true }
)

const outcomeSchema = new Schema(
  {
    keyAchievement: { type: String, default: "" },
    issueAndChallenges: { type: String, default: "" },
    additionalNotes: { type: String, default: "" },
    supportingDocuments: { type: [fileSchema], default: [] },
  },
  { _id: false }
)

const actualBudgetSchema = new Schema(
  {
    by: { type: String, default: "" },
    type: { type: String, default: "" },
    name: { type: String, default: "" },
    price: { type: Number, default: 0 },
    remark: { type: String, default: "" },
    sharedWith: { type: [sharedWithSchema], default: [] },
    hasFile: { type: Boolean, default: false },
    files: { type: [fileSchema], default: [] },
  },
  { _id: true }
)

const estimatedApprovalSchema = new Schema(
  {
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date, default: new Date() },
  },
  { _id: false }
)

const actualApprovalSchema = new Schema(
  {
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date, default: new Date() },
  },
  { _id: false }
)

const worthinessSchema = new Schema(
  {
    worthiness: { type: String, default: "" },
    reason: { type: String, default: "" },
    hasFile: { type: Boolean, default: false },
    files: { type: [fileSchema], default: [] },
  },
  { _id: false }
)

const cancellationSchema = new Schema(
  {
    reason: { type: String, required: true },
    cancelledBy: { type: String, required: true },
    cancelledAt: { type: Date, required: true },
    previousStatuses: {
      type: [String],
      enum: [
        "DRAFT",
        "WAITING_GA_ESTIMATE",
        "WAITING_GA_ACTUAL_COST",
        "WAITING_JV_APPROVAL",
        "JV_APPROVED",
        "JV_REJECTED",
        "WAITING_EMP_SUMMARY",
        "WAITING_CLAIM_ALLOWANCE",
        "GA_COMPLETED",
        "WAITING_PLANNER_COST_ANALYSIS",
        "COMPLETED",
        "WAITING",
        "CANCELLED",
      ],
      default: [],
    },
  },
  { _id: false }
)

// Shared field definitions for planned (`months`) and claimed (`monthsClaimed`) allowance buckets.
// The two invariants have diverged, so they now use DIFFERENT schemas built from these same fields:
//   months        -> unique per month                    (allowanceMonthSchema)
//   monthsClaimed -> unique per (month, transaction_id)  (claimedMonthSchema, carries transaction_id)
const allowanceMonthFields = {
  month: { type: String, default: "" },
  allowanceMonthly: { type: Number, default: 0 },
  allowanceDaily: { type: Number, default: 0 },
  allowanceDays: { type: Number, default: 0 },
  // allowanceRange: { type: { from: Date, to: Date }, default: { from: "", to: "" } },
  allowanceClaimed: { type: Number, default: 0 },
  allowanceAccum: { type: Number, default: 0 },
  allowanceRemaining: { type: Number, default: 0 },
  // Per-month allowance status = the status of the LAST webhook round that included this
  // (month, transaction_id). Only meaningful on monthsClaimed; planned `months` keep the "" default.
  // Same values as the participant status enum ("" allowed so the default validates).
  status: {
    type: String,
    enum: ["APPROVE", "REJECT", "CANCEL", "WAIT", "PENDING", "PENDING_REJECT", "PENDING_CANCEL", ""],
    default: "",
  },
  // Per-entry 5-day confirm deadline, stamped when this entry enters PENDING_REJECT/PENDING_CANCEL.
  // Each entry's window is independent: re-claiming one entry never resets another entry's deadline.
  pendingConfirmAt: { type: Date, default: null },
  pendingConfirmExpireAt: { type: Date, default: null },
}

// Planned allowance per month (unique per month) — no transaction identity.
const allowanceMonthSchema = new Schema(allowanceMonthFields, { _id: false })

// Actual claimed allowance per (month, transaction_id). Multiple entries can share a month, one per
// source document/transaction; entries from different transactions never overwrite one another.
const claimedMonthSchema = new Schema(
  {
    ...allowanceMonthFields,
    // Source document/transaction id from the webhook payload. Empty only on legacy data written
    // before this field existed (the webhook now rejects claim-bearing rounds with no transaction_id).
    transaction_id: { type: String, default: "" },
  },
  { _id: false }
)

const participantSchema = new Schema(
  {
    accountId: { type: String, default: "" },
    employeeId: { type: [String], default: "" },
    fullNameTh: { type: String, default: "" },
    isAllowance: { type: Boolean, default: false },
    months: { type: [allowanceMonthSchema], default: [] },
    monthsClaimed: { type: [claimedMonthSchema], default: [] },
    status: {
      type: String,
      enum: ["APPROVE", "REJECT", "CANCEL", "WAIT", "PENDING", "PENDING_REJECT", "PENDING_CANCEL"],
      default: "PENDING",
    },
  },
  { _id: false }
)

const plannerSchema = new Schema(
  {
    name: { type: String, default: "" },
    documentId: { type: String, default: "", immutable: true },
    dateRange: { type: daterangeSchema, default: { from: new Date(), to: new Date() } },
    objectives: { type: String, default: "" },
    expectedOutcomes: { type: String, default: "" },
    projectName: { type: String, default: "" },
    locations: { type: [locationSchema], default: [] },
    participants: { type: [participantSchema], default: [] },
    jvs: { type: [jvSchema], default: [] },
    estimatedBudget: { type: [estimatedBudgetSchema], default: [] },
    outcome: {
      type: outcomeSchema,
      default: {
        keyAchievement: "",
        issueAndChallenges: "",
        additionalNotes: "",
        supportingDocuments: [],
      },
    },
    actualBudget: { type: [actualBudgetSchema], default: [] },
    status: {
      type: [String],
      enum: [
        "DRAFT",
        "WAITING_GA_ESTIMATE",
        "WAITING_GA_ACTUAL_COST",
        "WAITING_JV_APPROVAL",
        "JV_APPROVED",
        "JV_REJECTED",
        "WAITING_EMP_SUMMARY",
        "WAITING_CLAIM_ALLOWANCE",
        "GA_COMPLETED",
        "WAITING_PLANNER_COST_ANALYSIS",
        "COMPLETED",
        "CANCELLED",
        "WAITING",
      ],
      default: ["WAITING_GA_ESTIMATE"],
    },
    createdBy: { type: String, default: "" },
    createdByEmployeeId: { type: [String], default: [] },
    estimatedApproval: { type: estimatedApprovalSchema, default: { approvedBy: "", approvedAt: "" } },
    actualApproval: { type: actualApprovalSchema, default: { approvedBy: "", approvedAt: "" } },
    worthiness: { type: worthinessSchema, default: { worthiness: "", reason: "", hasFile: false, files: [] } },
    cancellation: { type: cancellationSchema, default: null },
    allowance: { type: Number, default: 0 },
    allowanceClaimed: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Supports the pending-confirm sweep: find planners with a claimed MONTH in PENDING_REJECT/
// PENDING_CANCEL past its per-month deadline (the sweep's $elemMatch on monthsClaimed). NOT a TTL
// index — the sweep changes status, it never deletes documents.
plannerSchema.index({
  "participants.monthsClaimed.status": 1,
  "participants.monthsClaimed.pendingConfirmExpireAt": 1,
})

export type TPlanner = InferRawDocTypeFromSchema<typeof plannerSchema>
export const Planner = model<TPlanner>("Planner", plannerSchema, "planner")
