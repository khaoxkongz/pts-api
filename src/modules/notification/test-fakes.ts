import { type AppBadgeMessage, type AppPushMessage, type AppPushStore, type OnePlatform } from "./app-push.js"
import { type StoredNotification } from "./dto.js"
import { type NotificationStore } from "./publish-outbox-event.js"
import { type ResolvedNotification, type WorkflowEventPayload } from "./type.js"

// In-memory fakes for the notification store and OnePlatform ports, shared by the publishing and App Push tests.

export class FakeNotificationStore implements NotificationStore, AppPushStore {
  public readonly notifications = new Map<string, StoredNotification>()
  /** When set, the next save stores this many notifications and then fails. */
  public failSaveAfter: number | null = null
  /** When set, new notifications are stored with this body, as content with an empty body would be. */
  public storedBody: string | null = null
  /**
   * When set, the next save stores this many notifications and then never finishes, like a process that died,
   * unless failStalledSave is called.
   */
  public stallSaveAfter: number | null = null
  /** When set, marking a notification App-pushed fails with this error. */
  public markAppPushedFailure: Error | null = null
  private failStalled: ((error: Error) => void) | null = null
  private nextId = 1

  /** Makes the stalled save fail now, like a publish that outlived its lease and then failed. */
  public failStalledSave() {
    this.failStalled?.(new Error("notification store unavailable"))
  }

  public savedNotifications() {
    return [...this.notifications.values()]
  }

  /** Stores a notification for the account directly, as if an earlier event had saved it. */
  public addNotification(accountId: string, { readAt = null }: Pick<Partial<StoredNotification>, "readAt"> = {}) {
    const id = `notification-${this.nextId++}`
    const stored: StoredNotification = {
      _id: id,
      eventId: `event-for-${id}`,
      eventType: "PLANNER_CREATED",
      accountId,
      recipientKind: "GA",
      templateKey: "planner.created.ga",
      title: "มีแผนงานใหม่ !",
      body: "",
      sourceType: "PLANNER",
      sourceId: "PL-001",
      sourceName: "Site visit Chiang Mai",
      data: { documentId: "PL-001" },
      readAt,
      appPushedAt: null,
      createdAt: new Date("2026-10-06T00:00:00.000Z"),
    }
    this.notifications.set(id, stored)
    return stored
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
        body: this.storedBody ?? notification.body,
        sourceType: notification.sourceType,
        sourceId: notification.sourceId,
        sourceName: notification.sourceName,
        data: notification.data,
        readAt: null,
        appPushedAt: null,
        createdAt: new Date("2026-10-06T00:00:00.000Z"),
      }
      this.notifications.set(key, stored)
      saved.set(key, stored)
    }

    return [...saved.values()]
  }

  public async countUnread(accountId: string) {
    return this.savedNotifications().filter((n) => n.accountId === accountId && !n.readAt).length
  }

  // The same rule as the Mongo adapter: the pushed time is set only while it is still empty.
  public async markAppPushed(notificationId: string) {
    if (this.markAppPushedFailure) {
      throw this.markAppPushedFailure
    }
    const notification = this.savedNotifications().find((n) => n._id.toString() === notificationId)
    if (notification && !notification.appPushedAt) {
      notification.appPushedAt = new Date("2026-10-06T10:00:00.000Z")
    }
  }
}

export class FakeOnePlatform implements OnePlatform {
  /** Pushes OnePlatform reported as sent. */
  public readonly pushes: AppPushMessage[] = []
  /** App Badges OnePlatform reported as set. */
  public readonly badges: AppBadgeMessage[] = []
  /** Accounts whose pushes and badges fail, with the error the adapter would throw. */
  public readonly failures = new Map<string, Error>()
  /** The most calls that were waiting on OnePlatform at the same time. */
  public maxInFlight = 0
  private inFlight = 0

  public async pushNotifyToApp(message: AppPushMessage) {
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    try {
      // Every call takes a while, so calls that are allowed to overlap do.
      await new Promise((resolve) => setTimeout(resolve, 1))
      const failure = this.failures.get(message.to)
      if (failure) {
        throw failure
      }
      this.pushes.push(message)
    } finally {
      this.inFlight -= 1
    }
  }

  public async setBadge(message: AppBadgeMessage) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    const failure = this.failures.get(message.one_id)
    if (failure) {
      throw failure
    }
    this.badges.push(message)
  }
}
