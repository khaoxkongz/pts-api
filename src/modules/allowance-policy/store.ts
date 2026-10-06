import { AllowancePolicy, type TAllowancePolicy } from "@/models/allowance-policy.js"

export async function findPolicies(filter: Record<string, unknown>) {
  return await AllowancePolicy.aggregate([{ $match: filter }, { $sort: { effectiveFrom: -1, createdAt: -1 } }])
}

export async function findPolicyById(id: string) {
  return await AllowancePolicy.findById(id).lean()
}

export async function createPolicy(data: Partial<TAllowancePolicy>) {
  const doc = new AllowancePolicy(data)
  return await doc.save()
}

export async function updatePolicyById(id: string, update: Record<string, unknown>) {
  return await AllowancePolicy.findByIdAndUpdate(id, update, { new: true }).lean()
}

export async function findOneAndUpsertPolicy(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return await AllowancePolicy.findOneAndUpdate(filter, update, { new: true, upsert: true }).lean()
}
