import { describe, expect, it, vi } from "vite-plus/test"

import { createAppPush } from "./app-push.js"
import { FakeNotificationStore, FakeOnePlatform } from "./test-fakes.js"

function setup({ appPushOn = true }: { appPushOn?: boolean } = {}) {
  const notifications = new FakeNotificationStore()
  const onePlatform = new FakeOnePlatform()
  // With App Push off, no OnePlatform is given, as when no token is configured.
  const appPush = createAppPush({
    onePlatform: appPushOn ? onePlatform : null,
    store: notifications,
    miniAppId: "mini-app-1",
  })
  return { notifications, onePlatform, appPush }
}

describe("syncing the App Badge", () => {
  it("sets the badge to the account's full unread count, with an empty business ID", async () => {
    const { notifications, onePlatform, appPush } = setup()
    notifications.addNotification("ga-1")
    notifications.addNotification("ga-1")
    notifications.addNotification("ga-1", { readAt: new Date("2026-10-06T11:00:00.000Z") })
    notifications.addNotification("ga-2")

    await appPush.syncBadge("ga-1")

    expect(onePlatform.badges).toEqual([{ one_id: "ga-1", badge: 2, business_id: "", mini_app_id: "mini-app-1" }])
  })

  it("sets a badge of 0 once everything is read", async () => {
    const { notifications, onePlatform, appPush } = setup()
    notifications.addNotification("ga-1", { readAt: new Date("2026-10-06T11:00:00.000Z") })

    await appPush.syncBadge("ga-1")

    expect(onePlatform.badges.map((b) => [b.one_id, b.badge])).toEqual([["ga-1", 0]])
  })

  it("resolves and logs the account and reason when OnePlatform fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const { notifications, onePlatform, appPush } = setup()
    notifications.addNotification("ga-1")
    const failure = new Error("PUT v1/service/set-badge failed: HTTP 200, body status 400")
    onePlatform.failures.set("ga-1", failure)

    await expect(appPush.syncBadge("ga-1")).resolves.toBeUndefined()

    expect(onePlatform.badges).toEqual([])
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("ga-1"), failure)
    errorLog.mockRestore()
  })

  it("does nothing when App Push is off", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const { notifications, onePlatform, appPush } = setup({ appPushOn: false })
    notifications.addNotification("ga-1")

    await appPush.syncBadge("ga-1")

    expect(onePlatform.badges).toEqual([])
    // Being off is not a failure.
    expect(errorLog).not.toHaveBeenCalled()
    errorLog.mockRestore()
  })
})
