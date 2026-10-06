import { model, Schema, type InferSchemaType } from "mongoose"

const holderSchema = new Schema(
  {
    account_id: { type: String, default: "" },
    email: { type: [String], default: [] },
    full_name: { type: String, default: "" },
    role: { type: String, required: true },
  },
  { _id: false }
)

const schema = new Schema(
  {
    holder: { type: holderSchema, required: true },
    tokenHash: { type: String, required: true },
    prefix: { type: String, required: true, index: true },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
    revokedBy: { type: String, default: "" },
  },
  { timestamps: true }
)

export type TLoginLogsTokenHolder = InferSchemaType<typeof holderSchema>
export type TLoginLogsToken = InferSchemaType<typeof schema>
export const LoginLogsToken = model<TLoginLogsToken>("LoginLogsToken", schema, "login_logs_tokens")
