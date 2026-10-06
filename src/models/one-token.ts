import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    tokenType: { type: String, default: "" },
    expiresIn: { type: Number, default: 0 },
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expirationDate: { type: String, default: "" },
    accountId: { type: String, default: "" },
    result: { type: String, default: "" },
    username: { type: String, default: "" },
    sessionId: { type: String, required: true },
  },
  { timestamps: true }
)

type TOneToken = InferSchemaType<typeof schema>
export const OneToken = model<TOneToken>("OneToken", schema, "one_token")
