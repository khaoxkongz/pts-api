import { type PipelineStage } from "mongoose"

import { CompanyJV } from "@/models/employee-ra.js"
import { Supervisor, User } from "@/models/user.js"

export async function getEmployeeIdSupervisor(): Promise<string[]> {
  const pipeline: PipelineStage[] = [
    { $unwind: "$companies" },
    {
      $match: {
        "companies.positionLevel": {
          $in: ["Ast. Manager", "Manager", "GM", "SVP", "AVP", "VP", "MD", "DMD"],
        },
        "companies.employeeId": {
          $nin: ["", "-"],
          $ne: null,
        },
      },
    },
    {
      $group: {
        _id: "$companies.employeeId",
      },
    },
    {
      $project: {
        _id: 0,
        employeeId: "$_id",
      },
    },
  ]

  const result = await User.aggregate(pipeline)

  return result.map((r) => r.employeeId)
}

export async function addSupervisorEmployeeIds(supervisorEmployeeId: string, subordinateEmployeeIds: string[]) {
  await Supervisor.updateOne({ supervisorEmployeeId }, { $set: { subordinateEmployeeIds } }, { upsert: true }).exec()
}

export async function setBusinessIdForCompanyJV(taxId: string, businessId: string) {
  await CompanyJV.updateOne({ taxId }, { $set: { businessId } }, { upsert: true }).exec()
}
