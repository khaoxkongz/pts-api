import { CompanyJV } from "@/models/employee-ra.js"
import { Planner } from "@/models/planner.js"
import { STATUS } from "@/utils/status/status.js"

import { type TUpdateJvApprovalStatusParams, type TUpdateJvRejectionStatusParams } from "./type.js"

export async function findPlannerByDocumentId(documentId: string) {
  return await Planner.findOne({ documentId }).lean()
}

export async function findPlannerJvs(documentId: string) {
  const planner = await Planner.findOne({ documentId }, { jvs: 1 }).lean()
  return planner?.jvs ?? null
}

export async function updateJvApprovalStatus({
  documentId,
  taxId,
  ratio,
  me,
  jvStatus,
  approversList,
}: TUpdateJvApprovalStatusParams) {
  const setPayload: any = {
    "jvs.$.status": jvStatus,
    "jvs.$.percentageRatio": ratio.percentage,
    "jvs.$.expenseRatio": ratio.expense,
    "jvs.$.confirmedBy": me.userId,
    "jvs.$.confirmedAt": new Date(),
  }

  if (approversList !== undefined) {
    setPayload["jvs.$.approversList"] = approversList
  }

  return await Planner.findOneAndUpdate({ documentId, "jvs.taxId": taxId }, { $set: setPayload }, { new: true }).lean()
}

export async function resetOtherJvsStatus({ documentId, taxIds }: { documentId: string; taxIds: string[] }) {
  if (taxIds.length === 0) return true

  const result = await Planner.updateOne(
    { documentId },
    {
      $set: {
        "jvs.$[elem].status": STATUS.WAITING_JV_APPROVAL,
        "jvs.$[elem].confirmedBy": "",
        "jvs.$[elem].confirmedAt": null,
      },
    },
    {
      arrayFilters: [
        {
          "elem.taxId": { $in: taxIds },
        },
      ],
    }
  )
  return result.acknowledged
}

export async function updatePlannerStatus(documentId: string, status: string[]) {
  return await Planner.findOneAndUpdate(
    { documentId },
    {
      $set: {
        status,
      },
    },
    { new: true }
  ).lean()
}

export async function updateJvRejectionStatus({
  documentId,
  taxId,
  reason,
  me,
  jvStatus,
  approversList,
}: TUpdateJvRejectionStatusParams) {
  const setPayload = {
    "jvs.$.status": jvStatus,
    "jvs.$.rejectionReason": reason,
    "jvs.$.confirmedBy": me.userId,
    "jvs.$.confirmedAt": new Date(),
    "jvs.$.approversList": approversList,
  }

  return await Planner.findOneAndUpdate(
    { documentId, "jvs.taxId": taxId },
    {
      $set: setPayload,
    },
    { new: true }
  ).lean()
}

export async function getApproverList(taxId: string): Promise<any[]> {
  const approvers = await CompanyJV.findOne({ taxId }, { approversList: 1 }).lean()
  return approvers?.approversList ?? []
}
