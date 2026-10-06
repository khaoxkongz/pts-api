import { type QueryFilter } from "mongoose"

import { type TWorkflowEventOutbox, WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import { type FindDueOptions, type OutboxEvents } from "./publish-outbox-event.js"
import { type WorkflowEventPayload } from "./type.js"

// Every write to an Outbox Event lives in this file (ADR-0003).

/** Saves a pending Outbox Event for the Workflow Event and returns its id. */
export async function createOutboxEvent(event: WorkflowEventPayload): Promise<string> {
  const outbox = await new WorkflowEventOutbox({
    eventId: event.eventId,
    eventType: event.eventType,
    payload: event,
  }).save()

  return outbox._id.toString()
}

export interface MongoOutboxEventsOptions {
  // How long a lock lasts before another attempt may take the Outbox Event (OUTBOX_LEASE_MS).
  leaseMs: number
  now?: () => Date
}

export function createMongoOutboxEvents({ leaseMs, now = () => new Date() }: MongoOutboxEventsOptions): OutboxEvents {
  // The Outbox Events lock may take: pending or failed, or processing with an expired lease. A processing
  // event with no lock timestamp was locked before leases existed, so its lease counts as expired
  // (`lockedAt: null` also matches a missing field). Find-due uses the same filter, so it never returns
  // an id lock would refuse.
  function lockableFilter(at: Date): QueryFilter<TWorkflowEventOutbox> {
    return {
      $or: [
        { status: { $in: ["PENDING", "FAILED"] } },
        { status: "PROCESSING", lockedAt: { $lt: new Date(at.getTime() - leaseMs) } },
        { status: "PROCESSING", lockedAt: null },
      ],
    }
  }

  return {
    async lock(outboxId: string) {
      const lockedAt = now()
      const outbox = await WorkflowEventOutbox.findOneAndUpdate(
        {
          _id: outboxId,
          ...lockableFilter(lockedAt),
        },
        {
          $set: {
            status: "PROCESSING",
            lockedAt,
          },
          // Counted on lock, so a publish that kills the process still uses up an attempt.
          $inc: {
            attempts: 1,
          },
        },
        { new: true }
      ).lean()

      // The payload is stored as Mixed; it is always written from a WorkflowEventPayload by createOutboxEvent.
      return outbox ? (outbox.payload as WorkflowEventPayload) : null
    },

    async markPublished(outboxId: string) {
      await WorkflowEventOutbox.updateOne(
        { _id: outboxId },
        {
          $set: {
            status: "PUBLISHED",
            publishedAt: now(),
            lastError: "",
          },
        }
      )
    },

    async markFailed(outboxId: string, error: unknown) {
      await WorkflowEventOutbox.updateOne(
        { _id: outboxId },
        {
          $set: {
            status: "FAILED",
            lastError: error instanceof Error ? error.message : String(error),
          },
        }
      )
    },

    async findDue({ maxAttempts, limit }: FindDueOptions) {
      const due = await WorkflowEventOutbox.find(
        {
          ...lockableFilter(now()),
          attempts: {
            $lt: maxAttempts,
          },
        },
        { _id: 1 }
      )
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean()

      return due.map((outbox) => outbox._id.toString())
    },
  }
}
