import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "PUBLISHED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    // Set whenever the Outbox Event is locked; a processing event can be locked again once its lease runs out.
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Support the relay's find-due query: pending or failed oldest first, and processing with an expired lease.
schema.index({ status: 1, createdAt: 1 })
schema.index({ status: 1, lockedAt: 1 })

export type TWorkflowEventOutbox = InferSchemaType<typeof schema>
export const WorkflowEventOutbox = model<TWorkflowEventOutbox>("WorkflowEventOutbox", schema, "workflow_event_outbox")
