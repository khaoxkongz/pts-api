import { describe, expect, it } from "vite-plus/test"

import { type StoredNotification } from "./dto.js"
import { type RecipientResolver, type RecipientRole, type ResolvedRecipient } from "./evaluate-rules.js"
import { type NotificationDelivery, type PushHub, createOutboxEventPublisher } from "./publish-outbox-event.js"
import { type RecipientKind, type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

interface FixtureUser {
  accountId: string
  role?: RecipientRole | "EMPLOYEE" | "GM"
  employeeId?: string
  supervises?: string[]
}

function workflowEvent(overrides: Partial<WorkflowEventPayload> = {}): WorkflowEventPayload {
  const { metadata, ...rest } = overrides

  return {
    eventId: "event-1",
    eventType: "PLANNER_CREATED",
    actorAccountId: "actor",
    sourceType: "PLANNER",
    sourceId: "PL-001",
    sourceName: "Site visit Chiang Mai",
    targetType: "PLANNER",
    targetId: "PL-001",
    fromStatuses: [],
    toStatuses: ["WAITING_GA_ESTIMATE"],
    ...rest,
    metadata: {
      documentId: "PL-001",
      plannerName: "Site visit Chiang Mai",
      ...metadata,
    },
  }
}

class FakeRecipientResolver implements RecipientResolver {
  public failure: Error | null = null

  constructor(private readonly users: FixtureUser[]) {}

  public async resolveAccountRecipients(accountIds: string[], kind: RecipientKind): Promise<ResolvedRecipient[]> {
    this.throwIfFailing()
    const wanted = new Set(accountIds.filter(Boolean))
    return this.users.filter((user) => wanted.has(user.accountId)).map((user) => ({ accountId: user.accountId, kind }))
  }

  public async resolveRoleRecipients(role: RecipientRole, kind: RecipientKind): Promise<ResolvedRecipient[]> {
    this.throwIfFailing()
    return this.users.filter((user) => user.role === role).map((user) => ({ accountId: user.accountId, kind }))
  }

  public async resolveSupervisorRecipients(subordinateEmployeeIds: string[]): Promise<ResolvedRecipient[]> {
    this.throwIfFailing()
    return this.users
      .filter((user) => user.supervises?.some((employeeId) => subordinateEmployeeIds.includes(employeeId)))
      .map((user) => ({ accountId: user.accountId, kind: "SUPERVISOR" as const }))
  }

  private throwIfFailing() {
    if (this.failure) {
      throw this.failure
    }
  }
}

type OutboxStatus = "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED"

interface FakeOutboxEvent {
  status: OutboxStatus
  payload: WorkflowEventPayload
  attempts: number
  lastError: string
  statusHistory: OutboxStatus[]
}

class FakeNotificationDelivery implements NotificationDelivery {
  public readonly outbox = new Map<string, FakeOutboxEvent>()
  public readonly notifications = new Map<string, StoredNotification>()
  /** When set, the next save stores this many notifications and then fails. */
  public failSaveAfter: number | null = null
  private nextId = 1

  public addOutboxEvent(outboxId: string, payload: WorkflowEventPayload, status: OutboxStatus = "PENDING") {
    this.outbox.set(outboxId, { status, payload, attempts: 0, lastError: "", statusHistory: [status] })
  }

  public outboxEvent(outboxId: string) {
    const event = this.outbox.get(outboxId)
    if (!event) {
      throw new Error(`No outbox event ${outboxId}`)
    }
    return event
  }

  public savedNotifications() {
    return [...this.notifications.values()]
  }

  public async lockOutboxEventAndGetWorkflowEvent(outboxId: string) {
    const event = this.outbox.get(outboxId)
    if (!event || (event.status !== "PENDING" && event.status !== "FAILED")) {
      return null
    }
    this.transition(event, "PROCESSING")
    return event.payload
  }

  public async saveNotifications(event: WorkflowEventPayload, resolved: ResolvedNotification[]) {
    const failAfter = this.failSaveAfter
    this.failSaveAfter = null
    const saved = new Map<string, StoredNotification>()

    for (const [index, notification] of resolved.entries()) {
      if (failAfter !== null && index >= failAfter) {
        throw new Error("notification store unavailable")
      }

      const key = `${event.eventId}|${notification.accountId}|${notification.recipientKind}`
      const existing = this.notifications.get(key)
      if (existing) {
        saved.set(key, existing)
        continue
      }

      const stored: StoredNotification = {
        _id: `notification-${this.nextId++}`,
        eventId: event.eventId,
        eventType: notification.eventType,
        accountId: notification.accountId,
        recipientKind: notification.recipientKind,
        templateKey: notification.templateKey,
        title: notification.title,
        body: notification.body,
        sourceType: notification.sourceType,
        sourceId: notification.sourceId,
        sourceName: notification.sourceName,
        data: notification.data,
        readAt: null,
        createdAt: new Date("2026-10-06T00:00:00.000Z"),
      }
      this.notifications.set(key, stored)
      saved.set(key, stored)
    }

    return [...saved.values()]
  }

  public async updateOutboxStatusPublished(outboxId: string) {
    const event = this.outboxEvent(outboxId)
    event.attempts += 1
    event.lastError = ""
    this.transition(event, "PUBLISHED")
  }

  public async updateOutboxStatusFailed(outboxId: string, error: unknown) {
    const event = this.outboxEvent(outboxId)
    event.attempts += 1
    event.lastError = error instanceof Error ? error.message : String(error)
    this.transition(event, "FAILED")
  }

  private transition(event: FakeOutboxEvent, status: OutboxStatus) {
    event.status = status
    event.statusHistory.push(status)
  }
}

interface RecordedPush {
  accountId: string
  event: string
  payload: { id: string; recipientKind: string; title: string; body: string }
}

class RecordingPushHub implements PushHub {
  public readonly pushes: RecordedPush[] = []

  public push(accountId: string, event: string, payload: unknown) {
    this.pushes.push({ accountId, event, payload: payload as RecordedPush["payload"] })
  }
}

function setup(users: FixtureUser[]) {
  const recipientResolver = new FakeRecipientResolver(users)
  const delivery = new FakeNotificationDelivery()
  const pushHub = new RecordingPushHub()
  const publish = createOutboxEventPublisher({
    delivery,
    recipients: recipientResolver,
    pushHub,
  })

  return { recipientResolver, delivery, pushHub, publish }
}

function summarize(notifications: StoredNotification[]) {
  return notifications
    .map((n) => ({ accountId: n.accountId, recipientKind: n.recipientKind, templateKey: n.templateKey }))
    .sort((a, b) => `${a.accountId}${a.recipientKind}`.localeCompare(`${b.accountId}${b.recipientKind}`))
}

describe("publishing an Outbox Event", () => {
  it("notifies every GA about a new planner, pushes each notification and marks the event published", async () => {
    const { delivery, pushHub, publish } = setup([
      { accountId: "ga-1", role: "GA" },
      { accountId: "ga-2", role: "GA" },
      { accountId: "emp-1", role: "EMPLOYEE" },
    ])
    delivery.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

    await publish("outbox-1")

    const saved = delivery.savedNotifications()
    expect(summarize(saved)).toEqual([
      { accountId: "ga-1", recipientKind: "GA", templateKey: "planner.created.ga" },
      { accountId: "ga-2", recipientKind: "GA", templateKey: "planner.created.ga" },
    ])
    expect(saved[0]?.body).toBe("มีการสร้างแผนงานใหม่ Site visit Chiang Mai กรุณากรอกค่าใช้จ่ายประมาณการ")
    expect(pushHub.pushes.map((p) => [p.accountId, p.event, p.payload.id])).toEqual([
      ["ga-1", "notification.created", saved[0]?._id],
      ["ga-2", "notification.created", saved[1]?._id],
    ])
    expect(delivery.outboxEvent("outbox-1").status).toBe("PUBLISHED")
  })

  it("saves and pushes nothing for an Audit-only event but still marks it published", async () => {
    const { delivery, pushHub, publish } = setup([
      { accountId: "ga-1", role: "GA" },
      { accountId: "gm-1", role: "GM" },
    ])
    delivery.addOutboxEvent(
      "outbox-1",
      workflowEvent({
        eventType: "GM_JV_APPROVED",
        targetType: "JV",
        fromStatuses: ["WAITING_JV_APPROVAL"],
        toStatuses: ["WAITING_JV_APPROVAL"],
        metadata: { documentId: "PL-001", plannerName: "Site visit Chiang Mai", gmApproverAccountIds: ["gm-1"] },
      })
    )

    await publish("outbox-1")

    expect(delivery.savedNotifications()).toEqual([])
    expect(pushHub.pushes).toEqual([])
    expect(delivery.outboxEvent("outbox-1").status).toBe("PUBLISHED")
  })

  describe("a GA estimate confirmation", () => {
    const users: FixtureUser[] = [
      { accountId: "creator", role: "EMPLOYEE", employeeId: "E-1" },
      { accountId: "boss", role: "EMPLOYEE", employeeId: "E-9", supervises: ["E-1"] },
      { accountId: "unrelated-boss", role: "EMPLOYEE", employeeId: "E-8", supervises: ["E-7"] },
      { accountId: "gm-1", role: "GM" },
      { accountId: "gm-2", role: "GM" },
    ]

    function gaEstimateConfirmed(fromStatuses: string[], toStatuses: string[]) {
      return workflowEvent({
        eventType: "GA_ESTIMATE_CONFIRMED",
        fromStatuses,
        toStatuses,
        metadata: {
          documentId: "PL-001",
          plannerName: "Site visit Chiang Mai",
          creatorEmployeeIds: ["E-1"],
          gmApproverAccountIds: ["gm-1", "gm-2"],
        },
      })
    }

    it("is suppressed when the status guard does not match", async () => {
      const { delivery, pushHub, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", gaEstimateConfirmed(["WAITING_GA_ESTIMATE"], ["WAITING_GA_ESTIMATE"]))

      await publish("outbox-1")

      expect(delivery.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(delivery.outboxEvent("outbox-1").status).toBe("PUBLISHED")
    })

    it("notifies the creator's supervisor and the GM approvers, each with content for their Recipient Kind", async () => {
      const { delivery, pushHub, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", gaEstimateConfirmed(["WAITING_GA_ESTIMATE"], ["WAITING_JV_APPROVAL"]))

      await publish("outbox-1")

      const saved = delivery.savedNotifications()
      expect(summarize(saved)).toEqual([
        { accountId: "boss", recipientKind: "SUPERVISOR", templateKey: "ga.estimate.confirmed.supervisor" },
        { accountId: "gm-1", recipientKind: "GM_APPROVER", templateKey: "ga.estimate.confirmed.gm" },
        { accountId: "gm-2", recipientKind: "GM_APPROVER", templateKey: "ga.estimate.confirmed.gm" },
      ])
      expect(saved.find((n) => n.accountId === "boss")?.title).toBe("มีแผนงานใหม่ !")
      expect(saved.find((n) => n.accountId === "gm-1")?.title).toBe("มีแผนงานใหม่รอการอนุมัติ !")
      expect(pushHub.pushes.map((p) => p.accountId).sort()).toEqual(["boss", "gm-1", "gm-2"])
    })
  })

  describe("the Outbox Event lifecycle", () => {
    const gaUsers: FixtureUser[] = [
      { accountId: "ga-1", role: "GA" },
      { accountId: "ga-2", role: "GA" },
      { accountId: "ga-3", role: "GA" },
    ]

    it.each(["PUBLISHED", "PROCESSING"] as const)("skips an event that is already %s", async (status) => {
      const { delivery, pushHub, publish } = setup(gaUsers)
      delivery.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), status)

      await publish("outbox-1")

      expect(delivery.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(delivery.outboxEvent("outbox-1").statusHistory).toEqual([status])
    })

    it("marks the event failed and rethrows when recipients cannot be resolved", async () => {
      const { recipientResolver, delivery, pushHub, publish } = setup(gaUsers)
      recipientResolver.failure = new Error("user directory unavailable")
      delivery.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

      await expect(publish("outbox-1")).rejects.toThrow("user directory unavailable")

      expect(delivery.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(delivery.outboxEvent("outbox-1")).toMatchObject({
        status: "FAILED",
        lastError: "user directory unavailable",
        attempts: 1,
      })
    })

    it("marks the event failed and rethrows when notifications cannot be stored", async () => {
      const { delivery, pushHub, publish } = setup(gaUsers)
      delivery.failSaveAfter = 0
      delivery.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

      await expect(publish("outbox-1")).rejects.toThrow("notification store unavailable")

      expect(pushHub.pushes).toEqual([])
      expect(delivery.outboxEvent("outbox-1")).toMatchObject({
        status: "FAILED",
        lastError: "notification store unavailable",
        attempts: 1,
      })
    })

    it("on retry after a partial delivery, re-pushes existing notifications without duplicating them", async () => {
      const { delivery, pushHub, publish } = setup(gaUsers)
      delivery.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      delivery.failSaveAfter = 1
      await expect(publish("outbox-1")).rejects.toThrow()
      const [firstAttempt] = delivery.savedNotifications()

      await publish("outbox-1")

      const saved = delivery.savedNotifications()
      expect(summarize(saved).map((n) => n.accountId)).toEqual(["ga-1", "ga-2", "ga-3"])
      expect(saved).toContain(firstAttempt)
      expect(firstAttempt?._id).toBe("notification-1")
      expect(pushHub.pushes.map((p) => p.payload.id).sort()).toEqual([
        "notification-1",
        "notification-2",
        "notification-3",
      ])
      expect(delivery.outboxEvent("outbox-1")).toMatchObject({
        status: "PUBLISHED",
        lastError: "",
        attempts: 2,
        statusHistory: ["PENDING", "PROCESSING", "FAILED", "PROCESSING", "PUBLISHED"],
      })
    })
  })

  describe("a fully approved planner", () => {
    const users: FixtureUser[] = [
      { accountId: "creator", role: "EMPLOYEE", employeeId: "E-1" },
      { accountId: "ga-boss", role: "GA", employeeId: "E-9", supervises: ["E-1"] },
    ]

    const fullyApproved = workflowEvent({
      eventType: "PLANNER_FULLY_APPROVED",
      fromStatuses: ["WAITING_JV_APPROVAL"],
      toStatuses: ["WAITING_EMP_SUMMARY", "WAITING_GA_ACTUAL_COST"],
      metadata: {
        documentId: "PL-001",
        plannerName: "Site visit Chiang Mai",
        creatorAccountId: "creator",
        creatorEmployeeIds: ["E-1"],
        participantAccountIds: ["creator"],
      },
    })

    it("gives an account notified for two reasons one notification per Recipient Kind", async () => {
      const { delivery, pushHub, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", fullyApproved)

      await publish("outbox-1")

      const gaBossNotifications = delivery.savedNotifications().filter((n) => n.accountId === "ga-boss")
      expect(summarize(gaBossNotifications)).toEqual([
        { accountId: "ga-boss", recipientKind: "GA", templateKey: "planner.fully_approved.ga" },
        { accountId: "ga-boss", recipientKind: "SUPERVISOR", templateKey: "planner.fully_approved.supervisor" },
      ])
      expect(pushHub.pushes.filter((p) => p.accountId === "ga-boss")).toHaveLength(2)
    })

    it("gives an account reached by two targets with the same Recipient Kind only one notification", async () => {
      const { delivery, pushHub, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", fullyApproved)

      await publish("outbox-1")

      const creatorNotifications = delivery.savedNotifications().filter((n) => n.accountId === "creator")
      expect(summarize(creatorNotifications)).toEqual([
        { accountId: "creator", recipientKind: "EMPLOYEE", templateKey: "planner.fully_approved.employee" },
      ])
      expect(pushHub.pushes.filter((p) => p.accountId === "creator").map((p) => p.payload.id)).toEqual([
        creatorNotifications[0]?._id,
      ])
    })
  })

  describe("a planner ready for analysis", () => {
    const users: FixtureUser[] = [
      { accountId: "planner-1", role: "PLANNER" },
      { accountId: "finance-1", role: "FINANCE" },
    ]

    function readyForAnalysis(triggerAction?: "GA_ACTUAL_DONE" | "ALLOWANCE_RESOLVED") {
      return workflowEvent({
        eventType: "PLANNER_READY_FOR_ANALYSIS",
        fromStatuses: ["WAITING_GA_ACTUAL_COST"],
        toStatuses: ["WAITING_PLANNER_COST_ANALYSIS"],
        metadata: { documentId: "PL-001", plannerName: "Site visit Chiang Mai", triggerAction },
      })
    }

    it("chooses content by the event's metadata as well as the Recipient Kind", async () => {
      const { delivery, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", readyForAnalysis("ALLOWANCE_RESOLVED"))

      await publish("outbox-1")

      expect(summarize(delivery.savedNotifications())).toEqual([
        {
          accountId: "finance-1",
          recipientKind: "FINANCE",
          templateKey: "planner.ready_for_analysis.allowance_resolved.finance",
        },
        {
          accountId: "planner-1",
          recipientKind: "PLANNER",
          templateKey: "planner.ready_for_analysis.allowance_resolved.planner",
        },
      ])
    })

    it("falls back to the general content when the metadata does not match", async () => {
      const { delivery, publish } = setup(users)
      delivery.addOutboxEvent("outbox-1", readyForAnalysis("GA_ACTUAL_DONE"))

      await publish("outbox-1")

      const saved = delivery.savedNotifications()
      expect(summarize(saved)).toEqual([
        { accountId: "finance-1", recipientKind: "FINANCE", templateKey: "planner.ready_for_analysis.finance" },
        { accountId: "planner-1", recipientKind: "PLANNER", templateKey: "planner.ready_for_analysis.planner" },
      ])
      expect(saved.find((n) => n.accountId === "finance-1")?.body).toBe(
        "แผนงาน Site visit Chiang Mai ดำเนินการเสร็จสิ้นแล้ว"
      )
    })
  })
})
