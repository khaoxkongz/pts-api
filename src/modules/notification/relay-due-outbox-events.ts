import { type OutboxEvents } from "./publish-outbox-event.js"

export interface RelayDueOutboxEventsDeps {
  outbox: OutboxEvents
  // Publish-by-id: the same lock, publish and mark sequence as the dispatcher's immediate publish.
  publish: (outboxId: string) => Promise<void>
  maxAttempts: number
  batchSize: number
}

export interface RelayResult {
  attempted: number
  failed: number
}

/**
 * One relay tick: publishes every due Outbox Event by id. It never locks or sets status itself;
 * publish-by-id does, and an event another attempt has already locked is skipped there.
 */
export async function relayDueOutboxEvents(deps: RelayDueOutboxEventsDeps): Promise<RelayResult> {
  const dueIds = await deps.outbox.findDue({ maxAttempts: deps.maxAttempts, limit: deps.batchSize })
  let failed = 0

  for (const outboxId of dueIds) {
    try {
      await deps.publish(outboxId)
    } catch (error) {
      // One failing event must not stop the rest; publish-by-id has already marked it failed.
      failed += 1
      console.error(`[outbox-relay] failed to publish outbox event ${outboxId}:`, error)
    }
  }

  return { attempted: dueIds.length, failed }
}
