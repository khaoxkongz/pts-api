import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    actorAccountId: { type: String, required: true, index: true },
    sourceType: { type: String, required: true, default: "PLANNER" },
    sourceId: { type: String, required: true, index: true },
    sourceName: { type: String, default: "" },
    targetType: { type: String, default: "PLANNER" },
    targetId: { type: String, default: "" },
    fromStatuses: { type: [String], default: [] },
    toStatuses: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

export type TAuditLog = InferSchemaType<typeof schema>
export const AuditLog = model<TAuditLog>("AuditLog", schema, "audit_log")
