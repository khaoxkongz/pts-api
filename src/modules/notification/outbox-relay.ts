import { relayDueOutboxEvents } from "./relay-due-outbox-events.js"
import { outboxRelayDeps } from "./runtime.js"

// Due Outbox Events published per tick; the rest wait for the next tick.
const BATCH_SIZE = 100

let timer: ReturnType<typeof setInterval> | null = null
let isRunning = false

// Skip a tick if the previous relay is still in flight so runs never overlap.
async function tick(maxAttempts: number): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const result = await relayDueOutboxEvents({ ...outboxRelayDeps, maxAttempts, batchSize: BATCH_SIZE })
    if (result.attempted > 0) {
      console.log(`[outbox-relay] retried ${result.attempted} due outbox event(s), ${result.failed} failed`)
    }
  } catch (error) {
    console.error("[outbox-relay] failed:", error)
  } finally {
    isRunning = false
  }
}

export function startOutboxRelay(intervalMs: number, maxAttempts: number): void {
  if (timer) return
  timer = setInterval(() => {
    void tick(maxAttempts)
  }, intervalMs)
  console.log(`[outbox-relay] started, interval=${intervalMs}ms, maxAttempts=${maxAttempts}`)
}

export function stopOutboxRelay(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
