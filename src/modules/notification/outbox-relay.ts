import { type OutboxEvents } from "./publish-outbox-event.js"

// Due Outbox Events published per tick (find-due's limit); the rest wait for the next tick.
const LIMIT_PER_TICK = 100

interface OutboxRelayDeps {
  outbox: OutboxEvents
  // Publish-by-id: the same lock, publish and mark sequence as the dispatcher's immediate publish.
  publish: (outboxId: string) => Promise<void>
  // The attempts cap: find-due skips an Outbox Event whose attempts have reached it.
  maxAttempts: number
}

interface RelayResult {
  // Due ids found this tick; some may have been skipped because another attempt locked them first.
  due: number
  failed: number
  // True when the tick did nothing because this Relay's previous tick was still running.
  skipped: boolean
}

export function createOutboxRelay({ outbox, publish, maxAttempts }: OutboxRelayDeps) {
  let timer: ReturnType<typeof setInterval> | null = null
  let isRunning = false

  /**
   * One tick: publishes every due Outbox Event by id. It never locks or sets status itself;
   * publish-by-id does, and an event another attempt has already locked is skipped there.
   * Rejects when find-due fails; a failed publish is counted instead.
   */
  async function tick(): Promise<RelayResult> {
    // Skip a tick if the previous one is still in flight so runs never overlap.
    if (isRunning) return { due: 0, failed: 0, skipped: true }
    isRunning = true
    try {
      const dueIds = await outbox.findDue({ maxAttempts, limit: LIMIT_PER_TICK })
      let failed = 0

      for (const outboxId of dueIds) {
        try {
          await publish(outboxId)
        } catch (error) {
          // One failing event must not stop the rest; publish-by-id has already marked it failed.
          failed += 1
          console.error(`[outbox-relay] failed to publish outbox event ${outboxId}:`, error)
        }
      }

      return { due: dueIds.length, failed, skipped: false }
    } finally {
      isRunning = false
    }
  }

  return {
    start(intervalMs: number) {
      if (timer) return
      timer = setInterval(() => {
        tick()
          .then((result) => {
            if (result.due > 0) {
              console.log(`[outbox-relay] found ${result.due} due outbox event(s), ${result.failed} failed`)
            }
          })
          .catch((error: unknown) => {
            console.error("[outbox-relay] failed:", error)
          })
      }, intervalMs)
      console.log(`[outbox-relay] started, interval=${intervalMs}ms, maxAttempts=${maxAttempts}`)
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = null
    },
    tick,
  }
}
