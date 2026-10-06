import { Planner } from "@/models/planner.js"

export async function findPlannerByDocumentId(documentId: string) {
  return await Planner.findOne({ documentId }).lean()
}
