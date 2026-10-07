import pLimit from "p-limit"

import { type StoredNotification } from "./dto.js"

// The body of OnePlatform's push-notify-to-app.
export interface AppPushMessage {
  // The recipient's ONE ID: the account's accountId.
  to: string
  text: string
  app_path: string
  // The account's full unread count, including the notification being pushed (App Badge).
  badge: number
  business_id: string
  mini_app_id: string
}

// The body of OnePlatform's set-badge.
export interface AppBadgeMessage {
  // The account's ONE ID: its accountId.
  one_id: string
  // The account's full unread count, never a difference (App Badge).
  badge: number
  business_id: string
  mini_app_id: string
}

// OnePlatform's API. Each call rejects unless OnePlatform reports success.
export interface OnePlatform {
  pushNotifyToApp(message: AppPushMessage): Promise<void>
  setBadge(message: AppBadgeMessage): Promise<void>
}

export interface AppPushStore {
  countUnread(accountId: string): Promise<number>
  // Sets appPushedAt only while it is still empty.
  markAppPushed(notificationId: string): Promise<void>
}

export interface AppPushDeps {
  // null means App Push is off (no OnePlatform token): nothing is sent and nothing is marked pushed. A do-nothing
  // OnePlatform would look like a success and mark notifications pushed when nothing was sent.
  onePlatform: OnePlatform | null
  store: AppPushStore
  miniAppId: string
  // How many OnePlatform calls one Send makes at a time.
  concurrency?: number
}

export function createAppPush({ onePlatform, store, miniAppId, concurrency = 5 }: AppPushDeps) {
  // OnePlatform's business and mini app IDs, the same on every call.
  const app = { business_id: "", mini_app_id: miniAppId }

  // Never rejects: a failed push, or a push whose pushed mark fails, is logged (ADR-0004).
  async function pushOne(onePlatform: OnePlatform, notification: StoredNotification) {
    const id = notification._id.toString()
    try {
      const link = new URLSearchParams({ documentId: notification.sourceId, notificationId: id })
      await onePlatform.pushNotifyToApp({
        to: notification.accountId,
        text: notification.body ? `${notification.title}\n${notification.body}` : notification.title,
        app_path: `?${link.toString()}`,
        badge: await store.countUnread(notification.accountId),
        ...app,
      })
    } catch (error) {
      console.error(`[app-push] failed to push notification ${id} to account ${notification.accountId}:`, error)
      return
    }
    try {
      await store.markAppPushed(id)
    } catch (error) {
      // The push went out but isn't recorded, so a retried Outbox Event may push it again.
      console.error(
        `[app-push] pushed notification ${id} to account ${notification.accountId} but failed to mark it pushed; a retry may push it again:`,
        error
      )
    }
  }

  return {
    /**
     * Sends an App Push for each notification not yet pushed, and marks it pushed once OnePlatform reports
     * success. Never rejects: a failed push is logged, never retried, and doesn't stop the others (ADR-0004).
     */
    async send(notifications: StoredNotification[]): Promise<void> {
      if (!onePlatform) return
      const limit = pLimit(concurrency)
      // A retried Outbox Event passes notifications that already existed; those already pushed are skipped.
      const tasks = notifications
        .filter((notification) => !notification.appPushedAt)
        .map((notification) => limit(() => pushOne(onePlatform, notification)))
      await Promise.all(tasks)
    },

    /**
     * Sets the account's App Badge to its full unread count, never a difference, so a lost or late badge is
     * corrected by the next push or read. Never rejects: a failure is logged (ADR-0004).
     */
    async syncBadge(accountId: string): Promise<void> {
      if (!onePlatform) return
      try {
        await onePlatform.setBadge({
          one_id: accountId,
          badge: await store.countUnread(accountId),
          ...app,
        })
      } catch (error) {
        console.error(`[app-push] failed to set the App Badge for account ${accountId}:`, error)
      }
    },
  }
}

export type AppPush = ReturnType<typeof createAppPush>
