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

const plannerBefore = planner({
  status: ["WAITING_JV_APPROVAL"],
  jvs: [
    {
      taxId: "JV-A",
      status: "WAITING_JV_APPROVAL",
      percentageRatio: 60,
      expenseRatio: 50,
      approversList: [{ accountId: "acc-gm-a" }, { accountId: "acc-gm-b" }],
    },
    {
      taxId: "JV-B",
      status: "WAITING_JV_APPROVAL",
      percentageRatio: 40,
      expenseRatio: 50,
      approversList: [{ accountId: "acc-gm-b" }, { accountId: "acc-gm-c" }],
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
  stored.auditLogs.length = 0
  stored.outboxEvents.length = 0

  await new WorkflowEventDispatcher(async () => {}).dispatch(event)

  expect(stored.outboxEvents).toHaveLength(1)
  const [outbox] = stored.outboxEvents
  const payload = outbox?.payload as WorkflowEventPayload
  expect(outbox).toStrictEqual({ eventId: "event-1", eventType: event.type, payload })
  expect(stored.auditLogs).toStrictEqual([payload])

  return payload
}

describe("WorkflowEventDispatcher stored payloads", () => {
  beforeEach(() => {
    stored.auditLogs.length = 0
    stored.outboxEvents.length = 0
  })

  it("PLANNER_CREATED has no previous statuses", async () => {
    const payload = await storedPayload({
      type: "PLANNER_CREATED",
      payload: { planner: plannerAfter },
      meta: { actorAccountId: "acc-creator" },
    })

    expect(payload).toStrictEqual({
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

  it("GM_JV_REJECTED targets the JV and leaves the rejecting GM out of the GM approvers", async () => {
    const payload = await storedPayload({
      type: "GM_JV_REJECTED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-b", jvTaxId: "JV-B", rejectionReason: "Ratio is wrong" },
    })

    expect(payload).toStrictEqual({
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

  it("GM_JV_APPROVED targets the JV and records its ratios before and after", async () => {
    const payload = await storedPayload({
      type: "GM_JV_APPROVED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-a", jvTaxId: "JV-A" },
    })

    expect(payload).toStrictEqual({
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

  it("GM_JV_APPROVED for a JV missing from the planner falls back to empty statuses and zero ratios", async () => {
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

  it("GM_JV_REAPPROVAL_REQUIRED records the approvers of the reset JVs", async () => {
    const payload = await storedPayload({
      type: "GM_JV_REAPPROVAL_REQUIRED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-creator", triggeringJvTaxId: "JV-A", resetJvTaxIds: ["JV-B"] },
    })

    expect(payload).toStrictEqual({
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

  it("PLANNER_FULLY_APPROVED records the creator", async () => {
    const payload = await storedPayload({
      type: "PLANNER_FULLY_APPROVED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-gm-c" },
    })

    expect(payload).toStrictEqual({
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

  it("GA_ESTIMATE_CONFIRMED records the creator's employee ids and every GM approver", async () => {
    const payload = await storedPayload({
      type: "GA_ESTIMATE_CONFIRMED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-ga" },
    })

    expect(payload).toStrictEqual({
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

  it("GA_ACTUAL_CONFIRMED records the actual budget item count", async () => {
    const payload = await storedPayload({
      type: "GA_ACTUAL_CONFIRMED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-ga" },
    })

    expect(payload).toStrictEqual({
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

  it("PLANNER_ANALYSIS_COMPLETED records the worthiness", async () => {
    const payload = await storedPayload({
      type: "PLANNER_ANALYSIS_COMPLETED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-planner" },
    })

    expect(payload).toStrictEqual({
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

  it.each(["ALLOWANCE_CLAIM_CANCELLED", "ALLOWANCE_CLAIM_REJECTED"] as const)(
    "%s targets the claim's transaction",
    async (type) => {
      const payload = await storedPayload({
        type,
        payload: { plannerBefore, plannerAfter },
        meta: {
          actorAccountId: "acc-system",
          affectedParticipantAccountId: "acc-emp-2",
          affectedParticipantEmployeeId: "EMP-2",
          transactionId: "TX-9",
          pendingConfirmExpireAt: new Date("2026-08-23T00:00:00.000Z"),
        },
      })

      expect(payload).toStrictEqual({
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
    }
  )

  it("ALLOWANCE_CLAIM_REJECTED without a transaction targets the affected participant", async () => {
    const payload = await storedPayload({
      type: "ALLOWANCE_CLAIM_REJECTED",
      payload: { plannerBefore, plannerAfter },
      meta: {
        actorAccountId: "acc-system",
        affectedParticipantAccountId: "acc-emp-2",
        affectedParticipantEmployeeId: "EMP-2",
        transactionId: "",
        pendingConfirmExpireAt: new Date("2026-08-23T00:00:00.000Z"),
      },
    })

    expect(payload.targetType).toBe("PLANNER")
    expect(payload.targetId).toBe("acc-emp-2")
  })

  it("EMPLOYEE_SUMMARY_SUBMITTED records the actual budget and whether the outcome has files", async () => {
    const payload = await storedPayload({
      type: "EMPLOYEE_SUMMARY_SUBMITTED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-emp-1" },
    })

    expect(payload).toStrictEqual({
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

  it("PLANNER_READY_FOR_ANALYSIS records the action that triggered it", async () => {
    const payload = await storedPayload({
      type: "PLANNER_READY_FOR_ANALYSIS",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-system", triggerAction: "ALLOWANCE_RESOLVED" },
    })

    expect(payload).toStrictEqual({
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

  it("PLANNER_CANCELLED records the reason and who to notify", async () => {
    const payload = await storedPayload({
      type: "PLANNER_CANCELLED",
      payload: { plannerBefore, plannerAfter },
      meta: { actorAccountId: "acc-creator", reason: "Trip postponed", notifyGa: true, notifyGm: false },
    })

    expect(payload).toStrictEqual({
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
        cancellationReason: "Trip postponed",
        notifyGa: true,
        notifyGm: false,
        ...participants,
      },
    })
  })
})
