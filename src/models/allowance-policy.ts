import { model, Schema, type InferSchemaType } from "mongoose"

const allowancePolicySchema = new Schema(
  {
    positionKey: { type: String, required: true },
    aliases: { type: [String], default: [] },
    groupNameTh: { type: String, required: true },
    dailyRate: { type: Number, required: true },
    monthlyLimit: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
)

allowancePolicySchema.index({
  positionKey: 1,
  isActive: 1,
  effectiveFrom: -1,
  effectiveTo: 1,
})

allowancePolicySchema.index({ deletedAt: 1, isActive: 1 })

export type TAllowancePolicy = InferSchemaType<typeof allowancePolicySchema>
export const AllowancePolicy = model<TAllowancePolicy>("AllowancePolicy", allowancePolicySchema, "allowance_policy")
