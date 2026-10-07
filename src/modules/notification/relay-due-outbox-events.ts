import { type FindDueOptions, type OutboxEvents } from "./publish-outbox-event.js"

export interface RelayDueOutboxEventsDeps extends FindDueOptions {
  outbox: OutboxEvents
  // Publish-by-id: the same lock, publish and mark sequence as the dispatcher's immediate publish.
  publish: (outboxId: string) => Promise<void>
}

export interface RelayResult {
  // Due ids found this tick; some may have been skipped because another attempt locked them first.
  due: number
  failed: number
}

/**
 * One relay tick: publishes every due Outbox Event by id. It never locks or sets status itself;
 * publish-by-id does, and an event another attempt has already locked is skipped there.
 */
export async function relayDueOutboxEvents(deps: RelayDueOutboxEventsDeps): Promise<RelayResult> {
  const dueIds = await deps.outbox.findDue({ maxAttempts: deps.maxAttempts, limit: deps.limit })
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

  return { due: dueIds.length, failed }
}
