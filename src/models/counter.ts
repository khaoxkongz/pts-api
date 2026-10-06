import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    counterId: { type: String, required: true },
    sequence: { type: Number, default: 0 },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
  },
  { timestamps: true }
)

export type TCounter = InferSchemaType<typeof schema>
export const Counter = model<TCounter>("Counter", schema, "counter")
