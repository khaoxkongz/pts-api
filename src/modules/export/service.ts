import { consola } from "consola"
import ExcelJS from "exceljs"

import { type TPlanner } from "@/models/planner.js"
import { byMonthAsc } from "@/utils/participant-months.js"

import { buildExcelColumns, buildSelectedColumns, type ColumnConfig } from "./column-config.js"
import { buildExportQuery } from "./query-builder.js"
import * as ExportStore from "./store.js"
import { type IQueriyExportPlanner } from "./type.js"
import {
  formatCurrency,
  formatDateRange,
  formatFileUrls,
  formatJvNames,
  formatLocation,
  getColumnLetter,
  sumBudget,
} from "./utils.js"

type ExportRow = Record<string, string | number>

interface GenerateOptions {
  filter: IQueriyExportPlanner
  columns: Record<string, boolean | undefined> | null | undefined
}

function setupWorksheet(workbook: ExcelJS.Workbook, columnConfigs: ColumnConfig[]) {
  const worksheet = workbook.addWorksheet("Report Plan", {
    views: [{ state: "frozen" }],
  })
  worksheet.columns = buildExcelColumns(columnConfigs)
  styleHeaderRow(worksheet)
  return worksheet
}

function fillWorksheetData(
  worksheet: ExcelJS.Worksheet,
  planners: TPlanner[],
  columnConfigs: ColumnConfig[],
  maxLocations: number,
  columns: GenerateOptions["columns"]
) {
  const locationKeys = getLocationKeys(maxLocations)
  let currentRow = 2

  for (const planner of planners) {
    const startRow = currentRow
    const participants = planner.participants && planner.participants.length > 0 ? planner.participants : [null]

    for (const participant of participants) {
      const row = transformRow(planner, participant, columnConfigs, locationKeys, maxLocations, columns)
      const addedRow = worksheet.addRow(row)
      styleDataRow(addedRow)
      currentRow += 1
    }

    const endRow = currentRow - 1
    if (endRow > startRow) {
      applyMerges(worksheet, columnConfigs, startRow, endRow)
    }
  }
}

/**
 * Generate Excel file for planner export with dynamic columns
 */
export async function generatePlannerExcel({ filter, columns }: GenerateOptions): Promise<Buffer> {
  const mongoFilter = buildExportQuery(filter)
  const maxLocations = await ExportStore.getMaxLocations(mongoFilter)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Planner Tag System"
  workbook.created = new Date()

  const columnConfigs = buildSelectedColumns(columns, maxLocations)
  const worksheet = setupWorksheet(workbook, columnConfigs)
  const planners = await ExportStore.findPlanners(mongoFilter)

  fillWorksheetData(worksheet, planners, columnConfigs, maxLocations, columns)

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Apply merge cells for Plan-level columns
 */
export function applyMerges(
  worksheet: ExcelJS.Worksheet,
  columnConfigs: ColumnConfig[],
  startRow: number,
  endRow: number
): void {
  for (let index = 0; index < columnConfigs.length; index += 1) {
    const config = columnConfigs[index]
    if (config?.mergePerPlan) {
      const colLetter = getColumnLetter(index + 1)
      const mergeRange = `${colLetter}${startRow}:${colLetter}${endRow}`
      try {
        worksheet.mergeCells(mergeRange)
        const cell = worksheet.getCell(`${colLetter}${startRow}`)
        cell.alignment = { vertical: "middle", wrapText: true }
      } catch {
        consola.warn(`[Export] Failed to merge cells ${mergeRange}`)
      }
    }
  }
}

/**
 * Transform planner + participant into export row based on selected columns
 */
export function transformRow(
  planner: TPlanner,
  participant: TPlanner["participants"][number] | null,
  selectedColumns: ColumnConfig[],
  locationKeys: { addressKey: string; dateRangeKey: string }[],
  maxLocations: number,
  projection: Record<string, boolean | undefined> | null | undefined
): ExportRow {
  const row: ExportRow = {}
  const selectedKeys = new Set(selectedColumns.map((c) => c.key))

  mapPlanInfo(row, planner, selectedKeys)
  mapEmployeeInfo(row, participant, selectedKeys)
  mapLocations(row, planner, locationKeys, maxLocations, selectedKeys)
  mapJvAndBudget(row, planner, selectedKeys, projection)
  mapOutcomes(row, planner, selectedKeys)
  mapWorthiness(row, planner, selectedKeys)
  mapAllowance(row, participant, selectedKeys)

  return row
}

function mapPlanInfo(row: ExportRow, planner: TPlanner, keys: Set<string>) {
  if (keys.has("documentId")) {
    row.documentId = planner.documentId && planner.documentId !== "" ? planner.documentId : "-"
  }
  if (keys.has("name")) {
    row.name = planner.name && planner.name !== "" ? planner.name : "-"
  }
  if (keys.has("objectives")) {
    row.objectives = planner.objectives && planner.objectives !== "" ? planner.objectives : "-"
  }
  if (keys.has("expectedOutcomes")) {
    row.expectedOutcomes = planner.expectedOutcomes && planner.expectedOutcomes !== "" ? planner.expectedOutcomes : "-"
  }
  if (keys.has("projectName")) {
    row.projectName = planner.projectName && planner.projectName !== "" ? planner.projectName : "-"
  }
  if (keys.has("participantCount")) {
    row.participantCount = planner.participants && planner.participants.length > 0 ? planner.participants.length : 0
  }
  if (keys.has("dateRange")) {
    row.dateRange = formatDateRange({
      from: planner.dateRange?.from ?? undefined,
      to: planner.dateRange?.to ?? undefined,
    })
  }
}

function mapEmployeeInfo(row: ExportRow, participant: TPlanner["participants"][number] | null, keys: Set<string>) {
  if (keys.has("employeeId")) {
    row.employeeId = participant?.employeeId?.flat().join(", ") ?? "-"
  }
  if (keys.has("fullNameTh")) {
    row.fullNameTh = participant?.fullNameTh ?? "-"
  }
}

function mapLocations(
  row: ExportRow,
  planner: TPlanner,
  locationKeys: { addressKey: string; dateRangeKey: string }[],
  maxLocations: number,
  keys: Set<string>
) {
  for (let i = 0; i < maxLocations; i += 1) {
    const locKeys = locationKeys[i]
    if (locKeys) {
      if (keys.has(locKeys.addressKey)) {
        row[locKeys.addressKey] = formatLocation(planner.locations?.[i])
      }
      if (keys.has(locKeys.dateRangeKey)) {
        row[locKeys.dateRangeKey] = formatDateRange(
          planner.locations?.[i]?.dateRange
            ? {
                from: planner.locations?.[i]?.dateRange.from ?? undefined,
                to: planner.locations?.[i]?.dateRange.to ?? undefined,
              }
            : undefined
        )
      }
    }
  }
}

function mapJvAndBudget(
  row: ExportRow,
  planner: TPlanner,
  keys: Set<string>,
  projection: Record<string, boolean | undefined> | null | undefined
) {
  if (keys.has("jvNames")) {
    const showRatio = projection?.jvRatio === true || (!projection && keys.has("jvNames"))
    row.jvNames = formatJvNames(planner.jvs, showRatio)
  }
  if (keys.has("estimatedTotal")) {
    row.estimatedTotal = formatCurrency(sumBudget(planner.estimatedBudget))
  }
  if (keys.has("actualTotal")) {
    row.actualTotal = formatCurrency(sumBudget(planner.actualBudget))
  }
  if (keys.has("actualBudgetFiles")) {
    const files = planner.actualBudget?.flatMap((b) => b.files ?? []) ?? []
    row.actualBudgetFiles = formatFileUrls(files)
  }
}

function mapOutcomes(row: ExportRow, planner: TPlanner, keys: Set<string>) {
  if (keys.has("keyAchievement")) {
    row.keyAchievement =
      planner.outcome.keyAchievement && planner.outcome.keyAchievement !== "" ? planner.outcome.keyAchievement : "-"
  }
  if (keys.has("issueAndChallenges")) {
    row.issueAndChallenges =
      planner.outcome.issueAndChallenges && planner.outcome.issueAndChallenges !== ""
        ? planner.outcome.issueAndChallenges
        : "-"
  }
  if (keys.has("additionalNotes")) {
    row.additionalNotes =
      planner.outcome.additionalNotes && planner.outcome.additionalNotes !== "" ? planner.outcome.additionalNotes : "-"
  }
  if (keys.has("supportingDocs")) {
    row.supportingDocs = formatFileUrls(planner.outcome?.supportingDocuments)
  }
}

function mapWorthiness(row: ExportRow, planner: TPlanner, keys: Set<string>) {
  if (keys.has("worthinessStatus")) {
    row.worthinessStatus =
      planner.worthiness.worthiness && planner.worthiness.worthiness !== "" ? planner.worthiness.worthiness : "-"
  }
  if (keys.has("worthinessNotes")) {
    row.worthinessNotes =
      planner.worthiness.reason && planner.worthiness.reason !== "" ? planner.worthiness.reason : "-"
  }
  if (keys.has("worthinessFiles")) {
    row.worthinessFiles = formatFileUrls(planner.worthiness.files)
  }
}

function mapAllowance(row: ExportRow, participant: TPlanner["participants"][number] | null, keys: Set<string>) {
  if (!participant || !participant.months || participant.months.length === 0) {
    if (keys.has("allowanceClaimed")) {
      row.allowanceClaimed = "-"
    }
    if (keys.has("allowanceMonthly")) {
      row.allowanceMonthly = "-"
    }
    if (keys.has("allowanceAccum")) {
      row.allowanceAccum = "-"
    }
    if (keys.has("allowanceRemaining")) {
      row.allowanceRemaining = "-"
    }
    return
  }

  const months = byMonthAsc(participant.months)

  if (keys.has("allowanceClaimed")) {
    row.allowanceClaimed =
      months.length === 1
        ? formatCurrency(months?.[0]?.allowanceClaimed ?? 0)
        : months.map((m) => `${m.month}: ${formatCurrency(m.allowanceClaimed ?? 0)}`).join("\n")
  }
  if (keys.has("allowanceMonthly")) {
    row.allowanceMonthly =
      months.length === 1
        ? formatCurrency(months?.[0]?.allowanceMonthly ?? 0)
        : months.map((m) => `${m.month}: ${formatCurrency(m.allowanceMonthly ?? 0)}`).join("\n")
  }
  if (keys.has("allowanceAccum")) {
    row.allowanceAccum =
      months.length === 1
        ? formatCurrency(months?.[0]?.allowanceAccum ?? 0)
        : months.map((m) => `${m.month}: ${formatCurrency(m.allowanceAccum ?? 0)}`).join("\n")
  }
  if (keys.has("allowanceRemaining")) {
    row.allowanceRemaining =
      months.length === 1
        ? formatCurrency(months?.[0]?.allowanceRemaining ?? 0)
        : months.map((m) => `${m.month}: ${formatCurrency(m.allowanceRemaining ?? 0)}`).join("\n")
  }
}

/**
 * Get location column keys helper
 */
function getLocationKeys(maxLocations: number): { addressKey: string; dateRangeKey: string }[] {
  return Array.from({ length: maxLocations }, (_, i) => ({
    addressKey: `locationAddress_${i + 1}`,
    dateRangeKey: `locationDateRange_${i + 1}`,
  }))
}

/**
 * Style header row
 */
export function styleHeaderRow(worksheet: ExcelJS.Worksheet): void {
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
  headerRow.height = 33
}

/**
 * Style data row
 */
export function styleDataRow(row: ExcelJS.Row): void {
  row.alignment = { vertical: "middle", wrapText: true }
}
