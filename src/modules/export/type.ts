import * as ExportModel from "./model.js"

export type IQueriyExportPlanner = typeof ExportModel.queriesExportPlanner.static

export interface ILocation {
  name?: string
  addressNo?: string
  village?: string
  soi?: string
  street?: string
  province?: string
  district?: string
  subdistrict?: string
  zipcode?: string
}

export interface IDateRange {
  from?: Date
  to?: Date
}
