import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    eventId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    recipientKind: { type: String, required: true },
    templateKey: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    sourceType: { type: String, required: true, default: "PLANNER" },
    sourceId: { type: String, required: true, index: true },
    sourceName: { type: String, default: "" },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
)

schema.index({ eventId: 1, accountId: 1, recipientKind: 1 }, { unique: true })

export type TPlannerNotification = InferSchemaType<typeof schema>
export const PlannerNotification = model<TPlannerNotification>("PlannerNotification", schema, "planner_notification")
