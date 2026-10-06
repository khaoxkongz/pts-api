import { DateTime } from "luxon"

import env from "@/env.js"

import { type IDateRange, type ILocation } from "./type.js"

/**
 * Convert column number to Excel column letter (1 = A, 27 = AA, etc.)
 */
export function getColumnLetter(colNum: number): string {
  let letter = ""
  let num = colNum
  while (num > 0) {
    const mod = (num - 1) % 26
    letter = String.fromCodePoint(65 + mod) + letter
    num = Math.floor((num - mod - 1) / 26)
  }
  return letter
}

/**
 * Format location to single line string
 * Format: {name} {addressNo} {subdistrict} {district} {province} {zipcode}
 */
export function formatLocation(loc: ILocation | undefined): string {
  if (!loc) {
    return "-"
  }

  const parts = [loc.name, loc.addressNo, loc.subdistrict, loc.district, loc.province, loc.zipcode].filter(
    (part) => part && part.trim() !== ""
  )

  return parts.length > 0 ? parts.join(" ") : "-"
}

function formatSingleDate(date: Date | undefined): string {
  if (!date) {
    return ""
  }
  const dt = DateTime.fromJSDate(date).setZone("Asia/Bangkok")
  const buddhistYear = dt.year + 543
  const shortYear = String(buddhistYear).slice(-2)
  return `${dt.toFormat("dd/MM")}/${shortYear}`
}

/**
 * Format date range to Thai Buddhist Era format
 * Format: DD/MM/YY - DD/MM/YY (e.g., 01/12/68 - 05/12/68)
 */
export function formatDateRange(dateRange: IDateRange | undefined): string {
  if (!dateRange) {
    return "-"
  }

  const fromStr = formatSingleDate(dateRange.from)
  const toStr = formatSingleDate(dateRange.to)

  if (fromStr && toStr) {
    return `${fromStr} - ${toStr}`
  }

  return fromStr || toStr || "-"
}

/**
 * Format file URLs as newline-separated list for hyperlinks
 */
export function formatFileUrls(files: { url?: string; name?: string }[] | undefined): string {
  if (!files || files.length === 0) {
    return "-"
  }

  return files
    .filter((f) => f.url)
    .map((f) => `${env.API_BASE_URL}${f.url}`)
    .join("\n")
}

/**
 * Sum prices from budget items
 */
export function sumBudget(items: { price?: number }[] | undefined): number {
  if (!items || items.length === 0) {
    return 0
  }
  return items.reduce((sum, item) => sum + (item.price || 0), 0)
}

/**
 * Format number as Thai currency string
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Join JV company names with optional ratio
 */
export function formatJvNames(
  jvs: { companyFullNameTh?: string; percentageRatio?: number }[] | undefined,
  showRatio = false
): string {
  if (!jvs || jvs.length === 0) {
    return "-"
  }

  const names = jvs
    .map((jv) => {
      const name = jv.companyFullNameTh || "-"
      const ratio = showRatio && jv.percentageRatio !== undefined ? ` (${jv.percentageRatio.toFixed(2)}%)` : ""
      return `${name}${ratio}`
    })
    .filter(Boolean)

  return names.length > 0 ? names.join("\n") : "-"
}

/**
 * Generate filename with current date
 */
export function generateExportFilename(): string {
  const dt = DateTime.now().setZone("Asia/Bangkok")
  const dateStr = dt.toFormat("yyyyMMdd")
  return `Report_Plan_${dateStr}.xlsx`
}
