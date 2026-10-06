import { afterEach, describe, expect, it } from "vite-plus/test"

import { SsePushHub } from "./sse-push-hub.js"

interface SseEvent {
  event: string
  data: unknown
}

const openStreams: ReadableStreamDefaultReader<Uint8Array>[] = []

afterEach(async () => {
  await Promise.all(openStreams.splice(0).map((reader) => reader.cancel()))
})

function openStream(hub: SsePushHub, accountId: string) {
  const response = hub.createStreamResponse(accountId)
  const reader = response.body!.getReader()
  openStreams.push(reader)
  const decoder = new TextDecoder()
  let buffer = ""

  async function nextEvent(): Promise<SseEvent> {
    for (;;) {
      const end = buffer.indexOf("\n\n")
      if (end !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const lines = frame.split("\n").filter((line) => !line.startsWith(":"))
        if (lines.length === 0) {
          continue
        }
        const field = (name: string) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? ""
        return { event: field("event"), data: JSON.parse(field("data")) }
      }

      const { done, value } = await reader.read()
      if (done) {
        throw new Error("stream ended before the next event")
      }
      buffer += decoder.decode(value, { stream: true })
    }
  }

  return { response, nextEvent, cancel: () => reader.cancel() }
}

describe("SSE push hub", () => {
  it("sends a connected event first on a new stream", async () => {
    const hub = new SsePushHub()
    const stream = openStream(hub, "account-a")

    expect(stream.response.headers.get("Content-Type")).toBe("text/event-stream")
    expect(await stream.nextEvent()).toEqual({ event: "connected", data: { connected: true } })
  })

  it("delivers a push to the account as a named event with a JSON payload", async () => {
    const hub = new SsePushHub()
    const stream = openStream(hub, "account-a")
    await stream.nextEvent()

    hub.push("account-a", "notification", { id: "n-1", title: "Planner created" })

    expect(await stream.nextEvent()).toEqual({
      event: "notification",
      data: { id: "n-1", title: "Planner created" },
    })
  })

  it("does not deliver a push for a different account", async () => {
    const hub = new SsePushHub()
    const stream = openStream(hub, "account-a")
    await stream.nextEvent()

    hub.push("account-b", "notification", { id: "for-b" })
    hub.push("account-a", "notification", { id: "for-a" })

    expect(await stream.nextEvent()).toEqual({ event: "notification", data: { id: "for-a" } })
  })

  it("delivers a push to every open stream of the account, such as two tabs", async () => {
    const hub = new SsePushHub()
    const firstTab = openStream(hub, "account-a")
    const secondTab = openStream(hub, "account-a")
    await firstTab.nextEvent()
    await secondTab.nextEvent()

    hub.push("account-a", "notification", { id: "n-1" })

    expect(await firstTab.nextEvent()).toEqual({ event: "notification", data: { id: "n-1" } })
    expect(await secondTab.nextEvent()).toEqual({ event: "notification", data: { id: "n-1" } })
  })

  it("stops delivering to a cancelled stream without throwing", async () => {
    const hub = new SsePushHub()
    const closedTab = openStream(hub, "account-a")
    const openTab = openStream(hub, "account-a")
    await closedTab.nextEvent()
    await openTab.nextEvent()

    await closedTab.cancel()

    expect(() => hub.push("account-a", "notification", { id: "n-1" })).not.toThrow()
    expect(await openTab.nextEvent()).toEqual({ event: "notification", data: { id: "n-1" } })
  })

  it("accepts a push without throwing once the account's only stream is cancelled", async () => {
    const hub = new SsePushHub()
    const stream = openStream(hub, "account-a")
    await stream.nextEvent()

    await stream.cancel()

    expect(() => hub.push("account-a", "notification", { id: "n-1" })).not.toThrow()
  })
})
