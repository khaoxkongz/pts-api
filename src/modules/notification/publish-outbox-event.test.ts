import { describe, expect, it, vi } from "vite-plus/test"

import { type StoredNotification } from "./dto.js"
import { type RecipientResolver, type RecipientRole, type ResolvedRecipient } from "./evaluate-rules.js"
import {
  type FindDueOptions,
  type NotificationStore,
  type OutboxEvents,
  type PushHub,
  createOutboxEventPublisher,
} from "./publish-outbox-event.js"
import { relayDueOutboxEvents } from "./relay-due-outbox-events.js"
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

  public async resolveRoleRecipients(role: RecipientRole): Promise<ResolvedRecipient[]> {
    this.throwIfFailing()
    return this.users.filter((user) => user.role === role).map((user) => ({ accountId: user.accountId, kind: role }))
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
  lockedAt: Date | null
}

class FakeOutboxEvents implements OutboxEvents {
  public readonly events = new Map<string, FakeOutboxEvent>()
  /** The fake's clock: lock stamps this time and leases are measured against it. */
  public now = new Date("2026-10-06T10:00:00.000Z")

  constructor(private readonly leaseMs: number) {}

  public addOutboxEvent(
    outboxId: string,
    payload: WorkflowEventPayload,
    {
      status = "PENDING",
      attempts = 0,
      lastError = "",
      lockedAt = null,
    }: Partial<Pick<FakeOutboxEvent, "status" | "attempts" | "lastError" | "lockedAt">> = {}
  ) {
    this.events.set(outboxId, { status, payload, attempts, lastError, statusHistory: [status], lockedAt })
  }

  public outboxEvent(outboxId: string) {
    const event = this.events.get(outboxId)
    if (!event) {
      throw new Error(`No outbox event ${outboxId}`)
    }
    return event
  }

  public async lock(outboxId: string) {
    const event = this.events.get(outboxId)
    if (!event || !this.isLockable(event)) {
      return null
    }
    event.lockedAt = this.now
    event.attempts += 1
    this.transition(event, "PROCESSING")
    return event.payload
  }

  public async markPublished(outboxId: string) {
    const event = this.processingEvent(outboxId)
    if (!event) return
    event.lastError = ""
    this.transition(event, "PUBLISHED")
  }

  public async markFailed(outboxId: string, error: unknown) {
    const event = this.processingEvent(outboxId)
    if (!event) return
    event.lastError = error instanceof Error ? error.message : String(error)
    this.transition(event, "FAILED")
  }

  // Insertion order stands in for creation time, so the first added is the oldest.
  public async findDue({ maxAttempts, limit }: FindDueOptions) {
    return [...this.events]
      .filter(([, event]) => this.isLockable(event) && event.attempts < maxAttempts)
      .slice(0, limit)
      .map(([outboxId]) => outboxId)
  }

  // The same rule as the Mongo adapter's mark filter: a holder only records its outcome while the event is
  // still processing, so a holder whose lease expired can't undo a newer outcome.
  private processingEvent(outboxId: string) {
    const event = this.events.get(outboxId)
    return event?.status === "PROCESSING" ? event : null
  }

  // The same rule as the Mongo adapter's lock filter. A processing event with no lock timestamp
  // was locked before leases existed, so its lease counts as expired.
  private isLockable(event: FakeOutboxEvent) {
    if (event.status === "PENDING" || event.status === "FAILED") {
      return true
    }
    if (event.status !== "PROCESSING") {
      return false
    }
    return event.lockedAt === null || event.lockedAt.getTime() < this.now.getTime() - this.leaseMs
  }

  private transition(event: FakeOutboxEvent, status: OutboxStatus) {
    event.status = status
    event.statusHistory.push(status)
  }
}

class FakeNotificationStore implements NotificationStore {
  public readonly notifications = new Map<string, StoredNotification>()
  /** When set, the next save stores this many notifications and then fails. */
  public failSaveAfter: number | null = null
  /**
   * When set, the next save stores this many notifications and then never finishes, like a process that died,
   * unless failStalledSave is called.
   */
  public stallSaveAfter: number | null = null
  private failStalled: ((error: Error) => void) | null = null
  private nextId = 1

  /** Makes the stalled save fail now, like a publish that outlived its lease and then failed. */
  public failStalledSave() {
    this.failStalled?.(new Error("notification store unavailable"))
  }

  public savedNotifications() {
    return [...this.notifications.values()]
  }

  public async saveNotifications(event: WorkflowEventPayload, resolved: ResolvedNotification[]) {
    const failAfter = this.failSaveAfter
    const stallAfter = this.stallSaveAfter
    this.failSaveAfter = null
    this.stallSaveAfter = null
    const saved = new Map<string, StoredNotification>()

    for (const [index, notification] of resolved.entries()) {
      if (failAfter !== null && index >= failAfter) {
        throw new Error("notification store unavailable")
      }
      if (stallAfter !== null && index >= stallAfter) {
        return new Promise<never>((_, reject) => {
          this.failStalled = reject
        })
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

function setup(users: FixtureUser[], { leaseMs = 5 * 60_000 }: { leaseMs?: number } = {}) {
  const recipientResolver = new FakeRecipientResolver(users)
  const outbox = new FakeOutboxEvents(leaseMs)
  const notifications = new FakeNotificationStore()
  const pushHub = new RecordingPushHub()
  const publish = createOutboxEventPublisher({
    outbox,
    notifications,
    recipients: recipientResolver,
    pushHub,
  })

  const relay = (maxAttempts = 10) => relayDueOutboxEvents({ outbox, publish, maxAttempts, limit: 100 })

  return { recipientResolver, outbox, notifications, pushHub, publish, relay }
}

function summarize(notifications: StoredNotification[]) {
  return notifications
    .map((n) => ({ accountId: n.accountId, recipientKind: n.recipientKind, templateKey: n.templateKey }))
    .sort((a, b) => `${a.accountId}${a.recipientKind}`.localeCompare(`${b.accountId}${b.recipientKind}`))
}

describe("publishing an Outbox Event", () => {
  it("notifies every GA about a new planner, pushes each notification and marks the event published", async () => {
    const { outbox, notifications, pushHub, publish } = setup([
      { accountId: "ga-1", role: "GA" },
      { accountId: "ga-2", role: "GA" },
      { accountId: "emp-1", role: "EMPLOYEE" },
    ])
    outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

    await publish("outbox-1")

    const saved = notifications.savedNotifications()
    expect(summarize(saved)).toEqual([
      { accountId: "ga-1", recipientKind: "GA", templateKey: "planner.created.ga" },
      { accountId: "ga-2", recipientKind: "GA", templateKey: "planner.created.ga" },
    ])
    expect(saved[0]?.body).toBe("มีการสร้างแผนงานใหม่ Site visit Chiang Mai กรุณากรอกค่าใช้จ่ายประมาณการ")
    expect(pushHub.pushes.map((p) => [p.accountId, p.event, p.payload.id])).toEqual([
      ["ga-1", "notification.created", saved[0]?._id],
      ["ga-2", "notification.created", saved[1]?._id],
    ])
    expect(outbox.outboxEvent("outbox-1").status).toBe("PUBLISHED")
  })

  it("saves and pushes nothing for an Audit-only event but still marks it published", async () => {
    const { outbox, notifications, pushHub, publish } = setup([
      { accountId: "ga-1", role: "GA" },
      { accountId: "gm-1", role: "GM" },
    ])
    outbox.addOutboxEvent(
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

    expect(notifications.savedNotifications()).toEqual([])
    expect(pushHub.pushes).toEqual([])
    expect(outbox.outboxEvent("outbox-1").status).toBe("PUBLISHED")
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
      const { outbox, notifications, pushHub, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", gaEstimateConfirmed(["WAITING_GA_ESTIMATE"], ["WAITING_GA_ESTIMATE"]))

      await publish("outbox-1")

      expect(notifications.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1").status).toBe("PUBLISHED")
    })

    it("notifies the creator's supervisor and the GM approvers, each with content for their Recipient Kind", async () => {
      const { outbox, notifications, pushHub, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", gaEstimateConfirmed(["WAITING_GA_ESTIMATE"], ["WAITING_JV_APPROVAL"]))

      await publish("outbox-1")

      const saved = notifications.savedNotifications()
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
      const { outbox, notifications, pushHub, publish } = setup(gaUsers)
      // Locked just now, so a processing event is still inside its lease.
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
        status,
        lockedAt: outbox.now,
      })

      await publish("outbox-1")

      expect(notifications.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1").statusHistory).toEqual([status])
    })

    it("marks the event failed and rethrows when recipients cannot be resolved", async () => {
      const { recipientResolver, outbox, notifications, pushHub, publish } = setup(gaUsers)
      recipientResolver.failure = new Error("user directory unavailable")
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

      await expect(publish("outbox-1")).rejects.toThrow("user directory unavailable")

      expect(notifications.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "FAILED",
        lastError: "user directory unavailable",
        attempts: 1,
      })
    })

    it("marks the event failed and rethrows when notifications cannot be stored", async () => {
      const { outbox, notifications, pushHub, publish } = setup(gaUsers)
      notifications.failSaveAfter = 0
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

      await expect(publish("outbox-1")).rejects.toThrow("notification store unavailable")

      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "FAILED",
        lastError: "notification store unavailable",
        attempts: 1,
      })
    })

    it("on retry after a partial delivery, re-pushes existing notifications without duplicating them", async () => {
      const { outbox, notifications, pushHub, publish } = setup(gaUsers)
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      notifications.failSaveAfter = 1
      await expect(publish("outbox-1")).rejects.toThrow()
      const [firstAttempt] = notifications.savedNotifications()

      await publish("outbox-1")

      const saved = notifications.savedNotifications()
      expect(summarize(saved).map((n) => n.accountId)).toEqual(["ga-1", "ga-2", "ga-3"])
      expect(saved).toContain(firstAttempt)
      expect(firstAttempt?._id).toBe("notification-1")
      expect(pushHub.pushes.map((p) => p.payload.id).sort()).toEqual([
        "notification-1",
        "notification-2",
        "notification-3",
      ])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
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
      const { outbox, notifications, pushHub, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", fullyApproved)

      await publish("outbox-1")

      const gaBossNotifications = notifications.savedNotifications().filter((n) => n.accountId === "ga-boss")
      expect(summarize(gaBossNotifications)).toEqual([
        { accountId: "ga-boss", recipientKind: "GA", templateKey: "planner.fully_approved.ga" },
        { accountId: "ga-boss", recipientKind: "SUPERVISOR", templateKey: "planner.fully_approved.supervisor" },
      ])
      expect(pushHub.pushes.filter((p) => p.accountId === "ga-boss")).toHaveLength(2)
    })

    it("gives an account reached by two targets with the same Recipient Kind only one notification", async () => {
      const { outbox, notifications, pushHub, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", fullyApproved)

      await publish("outbox-1")

      const creatorNotifications = notifications.savedNotifications().filter((n) => n.accountId === "creator")
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
      const { outbox, notifications, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", readyForAnalysis("ALLOWANCE_RESOLVED"))

      await publish("outbox-1")

      expect(summarize(notifications.savedNotifications())).toEqual([
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
      const { outbox, notifications, publish } = setup(users)
      outbox.addOutboxEvent("outbox-1", readyForAnalysis("GA_ACTUAL_DONE"))

      await publish("outbox-1")

      const saved = notifications.savedNotifications()
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

describe("relaying due Outbox Events", () => {
  const gaUsers: FixtureUser[] = [
    { accountId: "ga-1", role: "GA" },
    { accountId: "ga-2", role: "GA" },
  ]

  it("publishes a failed Outbox Event on the next tick, notifying its recipients and pushing a Live Push", async () => {
    const { outbox, notifications, pushHub, relay } = setup(gaUsers)
    outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
      status: "FAILED",
      attempts: 1,
      lastError: "user directory unavailable",
    })

    await relay()

    expect(summarize(notifications.savedNotifications())).toEqual([
      { accountId: "ga-1", recipientKind: "GA", templateKey: "planner.created.ga" },
      { accountId: "ga-2", recipientKind: "GA", templateKey: "planner.created.ga" },
    ])
    expect(pushHub.pushes.map((p) => p.accountId)).toEqual(["ga-1", "ga-2"])
    expect(outbox.outboxEvent("outbox-1")).toMatchObject({ status: "PUBLISHED", lastError: "", attempts: 2 })
  })

  it("publishes a pending Outbox Event that was never published on the next tick", async () => {
    const { outbox, notifications, pushHub, relay } = setup(gaUsers)
    outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))

    await relay()

    expect(notifications.savedNotifications().map((n) => n.accountId)).toEqual(["ga-1", "ga-2"])
    expect(pushHub.pushes.map((p) => p.accountId)).toEqual(["ga-1", "ga-2"])
    expect(outbox.outboxEvent("outbox-1")).toMatchObject({
      status: "PUBLISHED",
      attempts: 1,
      statusHistory: ["PENDING", "PROCESSING", "PUBLISHED"],
    })
  })

  it("skips an Outbox Event whose attempts have reached the cap, leaving it failed with its last error", async () => {
    const { outbox, notifications, pushHub, relay } = setup(gaUsers)
    outbox.addOutboxEvent("at-cap", workflowEvent({ eventId: "event-1" }), {
      status: "FAILED",
      attempts: 3,
      lastError: "user directory unavailable",
    })
    outbox.addOutboxEvent("below-cap", workflowEvent({ eventId: "event-2" }), {
      status: "FAILED",
      attempts: 2,
      lastError: "user directory unavailable",
    })

    await relay(3)

    expect(outbox.outboxEvent("at-cap")).toMatchObject({
      status: "FAILED",
      attempts: 3,
      lastError: "user directory unavailable",
      statusHistory: ["FAILED"],
    })
    expect(outbox.outboxEvent("below-cap")).toMatchObject({ status: "PUBLISHED", attempts: 3 })
    expect(new Set(notifications.savedNotifications().map((n) => n.eventId))).toEqual(new Set(["event-2"]))
    expect(pushHub.pushes).toHaveLength(2)
  })

  it("doesn't republish a published Outbox Event", async () => {
    const { outbox, notifications, pushHub, relay } = setup(gaUsers)
    outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
      status: "PUBLISHED",
      attempts: 1,
    })

    await relay()

    expect(notifications.savedNotifications()).toEqual([])
    expect(pushHub.pushes).toEqual([])
    expect(outbox.outboxEvent("outbox-1")).toMatchObject({ attempts: 1, statusHistory: ["PUBLISHED"] })
  })

  it("still publishes the other Outbox Events in a tick when one of them fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const { outbox, notifications, pushHub, relay } = setup(gaUsers)
    outbox.addOutboxEvent("outbox-1", workflowEvent({ eventId: "event-1" }))
    outbox.addOutboxEvent("outbox-2", workflowEvent({ eventId: "event-2" }))
    outbox.addOutboxEvent("outbox-3", workflowEvent({ eventId: "event-3" }))
    // The oldest event is published first, so it is the one whose save fails.
    notifications.failSaveAfter = 0

    await relay()

    expect(outbox.outboxEvent("outbox-1")).toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastError: "notification store unavailable",
    })
    expect(outbox.outboxEvent("outbox-2").status).toBe("PUBLISHED")
    expect(outbox.outboxEvent("outbox-3").status).toBe("PUBLISHED")
    expect(new Set(notifications.savedNotifications().map((n) => n.eventId))).toEqual(new Set(["event-2", "event-3"]))
    expect(pushHub.pushes).toHaveLength(4)
    errorLog.mockRestore()
  })

  describe("a processing Outbox Event's lease", () => {
    const leaseMs = 5 * 60_000
    const lockedAt = new Date("2026-10-06T10:00:00.000Z")

    it("takes a processing Outbox Event again once its lease has expired and publishes it", async () => {
      const { outbox, notifications, pushHub, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
        status: "PROCESSING",
        lockedAt,
      })
      outbox.now = new Date(lockedAt.getTime() + leaseMs + 1)

      await relay()

      expect(notifications.savedNotifications().map((n) => n.accountId)).toEqual(["ga-1", "ga-2"])
      expect(pushHub.pushes.map((p) => p.accountId)).toEqual(["ga-1", "ga-2"])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "PUBLISHED",
        attempts: 1,
        statusHistory: ["PROCESSING", "PROCESSING", "PUBLISHED"],
      })
    })

    it("leaves a processing Outbox Event alone while it is still inside its lease", async () => {
      const { outbox, notifications, pushHub, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
        status: "PROCESSING",
        lockedAt,
      })
      outbox.now = new Date(lockedAt.getTime() + leaseMs - 1)

      await relay()

      expect(notifications.savedNotifications()).toEqual([])
      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({ attempts: 0, statusHistory: ["PROCESSING"] })
    })

    it("treats a processing Outbox Event with no lock timestamp as expired and publishes it", async () => {
      const { outbox, notifications, pushHub, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }), {
        status: "PROCESSING",
        lockedAt: null,
      })

      await relay()

      expect(notifications.savedNotifications().map((n) => n.accountId)).toEqual(["ga-1", "ga-2"])
      expect(pushHub.pushes.map((p) => p.accountId)).toEqual(["ga-1", "ga-2"])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "PUBLISHED",
        attempts: 1,
        statusHistory: ["PROCESSING", "PROCESSING", "PUBLISHED"],
      })
    })

    it("doesn't take an Outbox Event whose publish is still going inside its lease", async () => {
      const { outbox, notifications, pushHub, publish, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      notifications.stallSaveAfter = 1
      void publish("outbox-1")
      await vi.waitFor(() => expect(notifications.savedNotifications()).toHaveLength(1))
      outbox.now = new Date(outbox.now.getTime() + leaseMs - 1)

      await relay()

      expect(notifications.savedNotifications()).toHaveLength(1)
      expect(pushHub.pushes).toEqual([])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({ attempts: 1, statusHistory: ["PENDING", "PROCESSING"] })
    })

    it("re-pushes the notifications a dead publish already saved, without storing duplicates", async () => {
      const { outbox, notifications, pushHub, publish, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      // The first publish saves one notification and then never finishes, as if its process died.
      notifications.stallSaveAfter = 1
      void publish("outbox-1")
      await vi.waitFor(() => expect(notifications.savedNotifications()).toHaveLength(1))
      const [savedBeforeDying] = notifications.savedNotifications()
      expect(outbox.outboxEvent("outbox-1").status).toBe("PROCESSING")
      outbox.now = new Date(outbox.now.getTime() + leaseMs + 1)

      await relay()

      const saved = notifications.savedNotifications()
      expect(saved.map((n) => n.accountId)).toEqual(["ga-1", "ga-2"])
      expect(saved).toContain(savedBeforeDying)
      expect(pushHub.pushes.map((p) => p.payload.id)).toEqual([savedBeforeDying?._id, saved[1]?._id])
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "PUBLISHED",
        // The dead publish used up an attempt too.
        attempts: 2,
        statusHistory: ["PENDING", "PROCESSING", "PROCESSING", "PUBLISHED"],
      })
    })

    it("skips a processing Outbox Event with an expired lease once its attempts have reached the cap", async () => {
      const { outbox, notifications, pushHub, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("at-cap", workflowEvent({ eventId: "event-1" }), {
        status: "PROCESSING",
        attempts: 3,
        lastError: "notification store unavailable",
        lockedAt,
      })
      outbox.addOutboxEvent("no-lock-at-cap", workflowEvent({ eventId: "event-2" }), {
        status: "PROCESSING",
        attempts: 3,
        lockedAt: null,
      })
      outbox.addOutboxEvent("below-cap", workflowEvent({ eventId: "event-3" }), {
        status: "PROCESSING",
        attempts: 2,
        lockedAt,
      })
      outbox.now = new Date(lockedAt.getTime() + leaseMs + 1)

      await relay(3)

      expect(outbox.outboxEvent("at-cap")).toMatchObject({
        attempts: 3,
        lastError: "notification store unavailable",
        statusHistory: ["PROCESSING"],
      })
      expect(outbox.outboxEvent("no-lock-at-cap")).toMatchObject({ attempts: 3, statusHistory: ["PROCESSING"] })
      expect(outbox.outboxEvent("below-cap")).toMatchObject({ status: "PUBLISHED", attempts: 3 })
      expect(new Set(notifications.savedNotifications().map((n) => n.eventId))).toEqual(new Set(["event-3"]))
      expect(pushHub.pushes).toHaveLength(2)
    })

    it("keeps an Outbox Event published when a publish whose lease expired fails afterwards", async () => {
      const { outbox, notifications, publish, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      notifications.stallSaveAfter = 1
      const stalePublish = publish("outbox-1")
      await vi.waitFor(() => expect(notifications.savedNotifications()).toHaveLength(1))
      outbox.now = new Date(outbox.now.getTime() + leaseMs + 1)
      await relay()

      notifications.failStalledSave()

      await expect(stalePublish).rejects.toThrow("notification store unavailable")
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "PUBLISHED",
        lastError: "",
        statusHistory: ["PENDING", "PROCESSING", "PROCESSING", "PUBLISHED"],
      })
    })

    it("stops taking an Outbox Event whose publish keeps dying once its attempts reach the cap", async () => {
      const { outbox, notifications, publish, relay } = setup(gaUsers, { leaseMs })
      outbox.addOutboxEvent("outbox-1", workflowEvent({ eventType: "PLANNER_CREATED" }))
      // Every publish of this event dies part-way, as if it crashed the process.
      notifications.stallSaveAfter = 1
      void publish("outbox-1")
      await vi.waitFor(() => expect(notifications.savedNotifications()).toHaveLength(1))
      outbox.now = new Date(outbox.now.getTime() + leaseMs + 1)
      notifications.stallSaveAfter = 1
      void relay(2)
      await vi.waitFor(() =>
        expect(outbox.outboxEvent("outbox-1").statusHistory).toEqual(["PENDING", "PROCESSING", "PROCESSING"])
      )
      outbox.now = new Date(outbox.now.getTime() + leaseMs + 1)

      const result = await relay(2)

      expect(result.due).toBe(0)
      expect(outbox.outboxEvent("outbox-1")).toMatchObject({
        status: "PROCESSING",
        attempts: 2,
        statusHistory: ["PENDING", "PROCESSING", "PROCESSING"],
      })
    })
  })

  it("marks an Audit-only Outbox Event published without notifying anyone, and doesn't pick it up again", async () => {
    const { outbox, notifications, pushHub, relay } = setup([...gaUsers, { accountId: "gm-1", role: "GM" }])
    outbox.addOutboxEvent(
      "outbox-1",
      workflowEvent({
        eventType: "GM_JV_APPROVED",
        targetType: "JV",
        fromStatuses: ["WAITING_JV_APPROVAL"],
        toStatuses: ["WAITING_JV_APPROVAL"],
        metadata: { documentId: "PL-001", plannerName: "Site visit Chiang Mai", gmApproverAccountIds: ["gm-1"] },
      })
    )

    await relay()
    await relay()

    expect(notifications.savedNotifications()).toEqual([])
    expect(pushHub.pushes).toEqual([])
    expect(outbox.outboxEvent("outbox-1")).toMatchObject({
      attempts: 1,
      statusHistory: ["PENDING", "PROCESSING", "PUBLISHED"],
    })
  })
})
