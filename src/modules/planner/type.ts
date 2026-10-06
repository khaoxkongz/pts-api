import type * as PlannerModel from "./model.js"

export type IPlannerDTO = typeof PlannerModel.planner.static
export type ICreatePlannerDTO = typeof PlannerModel.createPlanner.static
export type IUpdatePlannerDTO = typeof PlannerModel.partialUpdatePlanner.static

export type IDateRangeDTO = typeof PlannerModel.dateRange.static
export type IParticipantDTO = typeof PlannerModel.participant.static
export type IJVItem = typeof PlannerModel.jvItem.static

export interface District {
  id: number
  name_th: string
  name_en: string
  province_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Province {
  id: number
  name_th: string
  name_en: string
  geography_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Subdistrict {
  id: number
  zip_code: number
  name_th: string
  name_en: string
  district_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}
