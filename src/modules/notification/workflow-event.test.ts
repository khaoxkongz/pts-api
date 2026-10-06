import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { Planner, type TPlanner } from "@/models/planner.js"

import { type WorkflowEventPayload } from "./type.js"
import { type WorkflowEvent, WorkflowEventDispatcher } from "./workflow-event.js"

const stored = vi.hoisted(() => ({
  auditLogs: [] as Record<string, unknown>[],
  outboxEvents: [] as Record<string, unknown>[],
}))

vi.mock("uuid", () => ({ v7: () => "event-1" }))

vi.mock("@/models/audit-log.js", () => ({
  AuditLog: class {
    constructor(private readonly doc: Record<string, unknown>) {}

    public async save() {
      stored.auditLogs.push(this.doc)
      return this
    }
  },
}))

vi.mock("@/models/workflow-event-outbox.js", () => ({
  WorkflowEventOutbox: class {
    public readonly _id = "outbox-1"

    constructor(private readonly doc: Record<string, unknown>) {}

    public async save() {
      stored.outboxEvents.push(this.doc)
      return this
    }
  },
}))

function planner(fields: Record<string, unknown>): TPlanner {
  return new Planner({
    documentId: "PL-001",
    name: "Site visit Chiang Mai",
    createdBy: "acc-creator",
    createdByEmployeeId: ["EMP-C"],
    ...fields,
  }).toObject()
}

// The planner before the change has its own identity, creator, participants and GM approvers, so a test fails
// whenever the payload reads any of them from the wrong planner.
const plannerBefore = planner({
  documentId: "PL-001-BEFORE",
  name: "Site visit Chiang Mai (before)",
  createdBy: "acc-creator-before",
  createdByEmployeeId: ["EMP-C-BEFORE"],
  status: ["WAITING_JV_APPROVAL"],
  participants: [{ accountId: "acc-emp-before", employeeId: ["EMP-BEFORE"] }],
  jvs: [
    {
      taxId: "JV-A",
      status: "WAITING_JV_APPROVAL",
      percentageRatio: 60,
      expenseRatio: 50,
      approversList: [{ accountId: "acc-gm-before" }],
    },
    {
      taxId: "JV-B",
      status: "WAITING_JV_APPROVAL",
      percentageRatio: 40,
      expenseRatio: 50,
      approversList: [{ accountId: "acc-gm-before" }],
    },
  ],
})

const plannerAfter = planner({
  status: ["WAITING_EMP_SUMMARY", "JV_APPROVED"],
  participants: [
    { accountId: "acc-emp-1", employeeId: ["EMP-1"] },
    { accountId: "acc-emp-2", employeeId: ["EMP-2", "EMP-2B"] },
    { accountId: "acc-emp-1", employeeId: ["EMP-1"] },
    { accountId: "", employeeId: [] },
  ],
  jvs: [
    {
      taxId: "JV-A",
      status: "JV_APPROVED",
      percentageRatio: 70,
      expenseRatio: 55,
      approversList: [{ accountId: "acc-gm-a" }, { accountId: "acc-gm-b" }],
    },
    {
      taxId: "JV-B",
      status: "JV_REJECTED",
      percentageRatio: 30,
      expenseRatio: 45,
      approversList: [{ accountId: "acc-gm-b" }, { accountId: "acc-gm-c" }, { accountId: "" }],
    },
  ],
  actualBudget: [{ name: "Hotel" }, { name: "Fuel" }],
  outcome: { supportingDocuments: [{ name: "report.pdf" }] },
  worthiness: { worthiness: "WORTH", reason: "Saves a second trip", files: [{ name: "memo.pdf" }] },
})

const plannerSource = { sourceType: "PLANNER", sourceId: "PL-001", sourceName: "Site visit Chiang Mai" } as const
const plannerTarget = { targetType: "PLANNER", targetId: "PL-001" } as const
const statusChange = { fromStatuses: ["WAITING_JV_APPROVAL"], toStatuses: ["WAITING_EMP_SUMMARY", "JV_APPROVED"] }
const plannerIdentity = { documentId: "PL-001", plannerName: "Site visit Chiang Mai" }
const participants = {
  participantAccountIds: ["acc-emp-1", "acc-emp-2"],
  participantEmployeeIds: ["EMP-1", "EMP-2", "EMP-2B"],
}

async function storedPayload(event: WorkflowEvent): Promise<WorkflowEventPayload> {
  await new WorkflowEventDispatcher(async () => {}).dispatch(event)

  expect(stored.outboxEvents).toHaveLength(1)
  const [outbox] = stored.outboxEvents
  const payload = outbox?.payload as WorkflowEventPayload
  expect(outbox).toStrictEqual({ eventId: "event-1", eventType: event.type, payload })
  expect(stored.auditLogs).toStrictEqual([payload])

  return payload
}

// The Outbox Event payload and the audit log metadata are stored as Mongo Mixed fields, which keep key order,
// so the order is pinned along with the values.
function expectStoredPayload(payload: WorkflowEventPayload, expected: WorkflowEventPayload) {
  expect(payload).toStrictEqual(expected)
  expect(Object.keys(payload)).toEqual(Object.keys(expected))
  expect(Object.keys(payload.metadata)).toEqual(Object.keys(expected.metadata))
}

const allowanceClaims = [
  { type: "ALLOWANCE_CLAIM_CANCELLED", claim: "cancelled" },
  { type: "ALLOWANCE_CLAIM_REJECTED", claim: "rejected" },
] as const

function allowanceClaimMeta(transactionId: string) {
  return {
    actorAccountId: "acc-system",
    affectedParticipantAccountId: "acc-emp-2",
    affectedParticipantEmployeeId: "EMP-2",
    transactionId,
    pendingConfirmExpireAt: new Date("2026-08-23T00:00:00.000Z"),
  }
}

describe("the payload stored for a Workflow Event", () => {
  beforeEach(() => {
    stored.auditLogs.length = 0
    stored.outboxEvents.length = 0
  })

  it("for a created planner has no statuses before the change", async () => {
    const payload = await storedPayload({
      type: "PLANNER_CREATED",
      payload: { planner: plannerAfter },
      meta: { actorAccountId: "acc-creator" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "PLANNER_CREATED",
      actorAccountId: "acc-creator",
      ...plannerSource,
      ...plannerTarget,
      fromStatuses: [],
      toStatuses: ["WAITING_EMP_SUMMARY", "JV_APPROVED"],
      metadata: { ...plannerIdentity, ...participants },
    })
  })

  it("for a JV a GM rejected targets the JV and leaves the rejecting GM out of the GM approvers", async () => {
    const payload = await storedPayload({
      type: "GM_JV_REJECTED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-b", jvTaxId: "JV-B", rejectionReason: "Ratio is wrong" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "GM_JV_REJECTED",
      actorAccountId: "acc-gm-b",
      ...plannerSource,
      targetType: "JV",
      targetId: "JV-B",
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        creatorAccountId: "acc-creator",
        creatorEmployeeIds: ["EMP-C"],
        gmApproverAccountIds: ["acc-gm-a", "acc-gm-c"],
        rejectionReason: "Ratio is wrong",
        jvTaxId: "JV-B",
        targetStatusBefore: "WAITING_JV_APPROVAL",
        targetStatusAfter: "JV_REJECTED",
        ...participants,
      },
    })
  })

  it("for a JV a GM approved targets the JV and records its ratios before and after", async () => {
    const payload = await storedPayload({
      type: "GM_JV_APPROVED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-a", jvTaxId: "JV-A" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "GM_JV_APPROVED",
      actorAccountId: "acc-gm-a",
      ...plannerSource,
      targetType: "JV",
      targetId: "JV-A",
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        jvTaxId: "JV-A",
        targetStatusBefore: "WAITING_JV_APPROVAL",
        targetStatusAfter: "JV_APPROVED",
        ratioBefore: { percentage: 60, expense: 50 },
        ratioAfter: { percentage: 70, expense: 55 },
        ...participants,
      },
    })
  })

  it("for an approved JV that is not on the planner records empty statuses and zero ratios", async () => {
    const payload = await storedPayload({
      type: "GM_JV_APPROVED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-a", jvTaxId: "JV-Z" },
    })

    expect(payload.metadata).toStrictEqual({
      ...plannerIdentity,
      jvTaxId: "JV-Z",
      targetStatusBefore: "",
      targetStatusAfter: "",
      ratioBefore: { percentage: 0, expense: 0 },
      ratioAfter: { percentage: 0, expense: 0 },
      ...participants,
    })
  })

  it("for JVs that need GM re-approval records the approvers of the JVs that were reset", async () => {
    const payload = await storedPayload({
      type: "GM_JV_REAPPROVAL_REQUIRED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-creator", triggeringJvTaxId: "JV-A", resetJvTaxIds: ["JV-B"] },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "GM_JV_REAPPROVAL_REQUIRED",
      actorAccountId: "acc-creator",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        jvTaxId: "JV-A",
        resetJvTaxIds: ["JV-B"],
        resetApproverAccountIds: ["acc-gm-b", "acc-gm-c"],
        ...participants,
      },
    })
  })

  it("for a fully approved planner records its creator", async () => {
    const payload = await storedPayload({
      type: "PLANNER_FULLY_APPROVED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-c" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "PLANNER_FULLY_APPROVED",
      actorAccountId: "acc-gm-c",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        creatorAccountId: "acc-creator",
        creatorEmployeeIds: ["EMP-C"],
        ...participants,
      },
    })
  })

  it("for a GA-confirmed estimate records the creator's employee ids and every GM approver", async () => {
    const payload = await storedPayload({
      type: "GA_ESTIMATE_CONFIRMED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-ga" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "GA_ESTIMATE_CONFIRMED",
      actorAccountId: "acc-ga",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        creatorEmployeeIds: ["EMP-C"],
        gmApproverAccountIds: ["acc-gm-a", "acc-gm-b", "acc-gm-c"],
        ...participants,
      },
    })
  })

  it("for GA-confirmed actual costs records how many actual budget items there are", async () => {
    const payload = await storedPayload({
      type: "GA_ACTUAL_CONFIRMED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-ga" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "GA_ACTUAL_CONFIRMED",
      actorAccountId: "acc-ga",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        actualBudgetItemCount: 2,
        triggerAction: "GA_ACTUAL_DONE",
        ...participants,
      },
    })
  })

  it("for a completed planner analysis records the planner's worthiness", async () => {
    const payload = await storedPayload({
      type: "PLANNER_ANALYSIS_COMPLETED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-planner" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "PLANNER_ANALYSIS_COMPLETED",
      actorAccountId: "acc-planner",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        gmApproverAccountIds: ["acc-gm-a", "acc-gm-b", "acc-gm-c"],
        worthinessValue: "WORTH",
        worthinessReason: "Saves a second trip",
        worthinessHasFile: true,
        ...participants,
      },
    })
  })

  it.each(allowanceClaims)("for a $claim allowance claim targets the claim's transaction", async ({ type }) => {
    const payload = await storedPayload({
      type,
      payload: { plannerBefore, plannerAfter },
      meta: allowanceClaimMeta("TX-9"),
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: type,
      actorAccountId: "acc-system",
      ...plannerSource,
      targetType: "PLANNER",
      targetId: "TX-9",
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        affectedParticipantAccountId: "acc-emp-2",
        affectedParticipantEmployeeId: "EMP-2",
        transactionId: "TX-9",
        pendingConfirmExpireAt: "2026-08-23T00:00:00.000Z",
        ...participants,
      },
    })
  })

  it.each(allowanceClaims)(
    "for a $claim allowance claim without a transaction targets the affected participant",
    async ({ type }) => {
      const payload = await storedPayload({
        type,
        payload: { plannerBefore, plannerAfter },
        meta: allowanceClaimMeta(""),
      })

      expect(payload.targetType).toBe("PLANNER")
      expect(payload.targetId).toBe("acc-emp-2")
    }
  )

  it("for a submitted employee summary records the actual budget and whether the outcome has files", async () => {
    const payload = await storedPayload({
      type: "EMPLOYEE_SUMMARY_SUBMITTED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-emp-1" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "EMPLOYEE_SUMMARY_SUBMITTED",
      actorAccountId: "acc-emp-1",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        actualBudgetItemCount: 2,
        outcomeHasFile: true,
        triggerAction: "EMP_SUMMARY_DONE",
        ...participants,
      },
    })
  })

  it("for a planner ready for analysis records the action that made it ready", async () => {
    const payload = await storedPayload({
      type: "PLANNER_READY_FOR_ANALYSIS",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-system", triggerAction: "ALLOWANCE_RESOLVED" },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "PLANNER_READY_FOR_ANALYSIS",
      actorAccountId: "acc-system",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        creatorEmployeeIds: ["EMP-C"],
        gmApproverAccountIds: ["acc-gm-a", "acc-gm-b", "acc-gm-c"],
        triggerAction: "ALLOWANCE_RESOLVED",
        ...participants,
      },
    })
  })

  it("for a cancelled planner records the reason and who to notify", async () => {
    const payload = await storedPayload({
      type: "PLANNER_CANCELLED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-creator", reason: "Trip postponed", notifyGa: true, notifyGm: false },
    })

    expectStoredPayload(payload, {
      eventId: "event-1",
      eventType: "PLANNER_CANCELLED",
      actorAccountId: "acc-creator",
      ...plannerSource,
      ...plannerTarget,
      ...statusChange,
      metadata: {
        ...plannerIdentity,
        creatorAccountId: "acc-creator",
        creatorEmployeeIds: ["EMP-C"],
        gmApproverAccountIds: ["acc-gm-a", "acc-gm-b", "acc-gm-c"],
        ...participants,
        cancellationReason: "Trip postponed",
        notifyGa: true,
        notifyGm: false,
      },
    })
  })
})
