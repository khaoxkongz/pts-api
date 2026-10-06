import { model, Schema, type InferSchemaType } from "mongoose"

const schema = new Schema(
  {
    normalizedName: { type: String, required: true },
    name: { type: String, required: true },
    addressNo: { type: String, default: "" },
    soi: { type: String, default: "" },
    village: { type: String, default: "" },
    street: { type: String, default: "" },
    district: { type: String, default: "" },
    province: { type: String, default: "" },
    subdistrict: { type: String, default: "" },
    zipcode: { type: String, default: "" },
  },
  { timestamps: true }
)

export type TLocation = InferSchemaType<typeof schema>
export const Location = model<TLocation>("Location", schema, "location")
