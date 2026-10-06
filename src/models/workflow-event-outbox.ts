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
  },
  { timestamps: true }
)

// Supports the relay's find-due query: status filter, oldest first.
schema.index({ status: 1, createdAt: 1 })

export type TWorkflowEventOutbox = InferSchemaType<typeof schema>
export const WorkflowEventOutbox = model<TWorkflowEventOutbox>("WorkflowEventOutbox", schema, "workflow_event_outbox")
