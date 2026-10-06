import { type TPlanner } from "@/models/planner.js"
import * as JVModel from "@/modules/jv/model.js"
import { type PlannerStatus } from "@/utils/status/status.js"

export type TProfile = typeof JVModel.profile.static

export interface TBaseParams {
  documentId: string
  me: TProfile
}

export interface TApproveJVParams extends TBaseParams {
  jvs: {
    taxId: string
    ratio: {
      percentage: number
      expense: number
    }
  }[]
}

export interface TRejectJVParams extends TBaseParams {
  jvs: {
    taxId: string
    reason: string
  }[]
}

export type TProcessJvApprovalParams = {
  jv: TPlanner["jvs"][number]
  taxId: string
  ratio: {
    percentage: number
    expense: number
  }
  documentId: string
  me: TProfile
}

export type TUpdateJvApprovalStatusParams = {
  documentId: string
  taxId: string
  ratio: {
    percentage: number
    expense: number
  }
  me: TProfile
  jvStatus: PlannerStatus
  approversList?: {
    employeeId: string[]
    nameTh: string
    accountId: string
  }[]
}

export type TUpdateJvRejectionParams = {
  jv: TPlanner["jvs"][number]
  taxId: string
  reason: string
  documentId: string
  me: TProfile
}

export type TUpdateJvRejectionStatusParams = {
  documentId: string
  taxId: string
  reason: string
  me: TProfile
  jvStatus: PlannerStatus
  approversList: {
    employeeId: string[]
    nameTh: string
    accountId: string
  }[]
}
