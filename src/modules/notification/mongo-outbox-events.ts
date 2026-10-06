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

// The Outbox Events lock may take. Find-due uses the same filter, so it never returns an id lock would refuse.
function lockableFilter(): QueryFilter<TWorkflowEventOutbox> {
  return {
    status: {
      $in: ["PENDING", "FAILED"],
    },
  }
}

export const MongoOutboxEvents: OutboxEvents = {
  async lock(outboxId: string) {
    const outbox = await WorkflowEventOutbox.findOneAndUpdate(
      {
        _id: outboxId,
        ...lockableFilter(),
      },
      {
        $set: {
          status: "PROCESSING",
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
          publishedAt: new Date(),
          lastError: "",
        },
        $inc: {
          attempts: 1,
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
        $inc: {
          attempts: 1,
        },
      }
    )
  },

  async findDue({ maxAttempts, limit }: FindDueOptions) {
    const due = await WorkflowEventOutbox.find(
      {
        ...lockableFilter(),
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
