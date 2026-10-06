import { model, Schema, type InferSchemaType } from "mongoose"

const callerSchema = new Schema(
  {
    account_id: { type: String, default: "" },
    email: { type: [String], default: [] },
    full_name: { type: String, default: "" },
    role: { type: String, default: "" },
  },
  { _id: false }
)

const schema = new Schema(
  {
    caller: { type: callerSchema, default: null },
    key_id: { type: String, default: null },
    key_prefix: { type: String, default: null },
    method: { type: String, required: true },
    path: { type: String, required: true },
    query: { type: Schema.Types.Mixed, default: {} },
    status_code: { type: Number, required: true },
    result_count: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    user_agent: { type: String, default: "" },
    duration_ms: { type: Number, default: 0 },
    requestedAt: { type: Date, required: true },
    requestedAtTh: { type: String, default: "" },
  },
  { timestamps: true }
)

schema.index({ requestedAt: -1 })
schema.index({ "caller.account_id": 1 })
schema.index({ key_id: 1 })

export type TLoginLogsAccessLog = InferSchemaType<typeof schema>
export const LoginLogsAccessLog = model<TLoginLogsAccessLog>("LoginLogsAccessLog", schema, "login_logs_access_logs")
