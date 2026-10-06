import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    expiresIn: { type: Date, required: true },
    token: { type: String, required: true },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    userId: { type: String, required: true },
  },
  { timestamps: true }
)

export type TSession = InferSchemaType<typeof schema>
export const Session = model<TSession>("Session", schema, "session")
