import { DateTime } from "luxon"

import { type IDateRangeDTO } from "../planner/type.js"

const TIME_ZONE = "Asia/Bangkok"

export interface IAllowanceMonthlyQueryRange {
  month: string
  startDate: string
  endDate: string
}

export function resolvePlanMonths(dateRange: IDateRangeDTO): string[] {
  const { fromDate, toDate } = parseAndValidateRange(dateRange, "planner.dateRange")
  const start = fromDate.startOf("month")
  const end = toDate.startOf("month")
  const months: string[] = []

  let cursor = start
  while (cursor <= end) {
    months.push(cursor.toFormat("yyyy-MM"))
    cursor = cursor.plus({ months: 1 })
  }

  return months
}

export function expandRangeToCalendarDays(dateRange: IDateRangeDTO): string[] {
  const { fromDate, toDate } = parseAndValidateRange(dateRange, "dateRange")
  return expandDateTimeRangeToCalendarDays(fromDate, toDate)
}

export function getBangkokMonthBounds(month: string): { startDate: string; endDate: string } {
  const parsed = DateTime.fromFormat(month, "yyyy-MM", { zone: TIME_ZONE })

  if (!parsed.isValid) {
    throw new Error(`INVALID_MONTH: ${month}`)
  }

  const start = parsed.startOf("month").toFormat("yyyy-MM-dd")
  const end = parsed.endOf("month").toFormat("yyyy-MM-dd")

  return { startDate: start, endDate: end }
}

export function resolveMonthlyQueryRanges({
  startDate,
  endDate,
}: {
  startDate: string
  endDate: string
}): IAllowanceMonthlyQueryRange[] {
  const months = resolvePlanMonths({ from: startDate, to: endDate })
  const lastMonth = months.at(-1) ?? ""
  const ranges: IAllowanceMonthlyQueryRange[] = []

  for (const month of months) {
    const bounds = getBangkokMonthBounds(month)
    ranges.push({
      month,
      startDate: bounds.startDate,
      endDate: month === lastMonth ? endDate : bounds.endDate,
    })
  }

  return ranges
}

function expandDateTimeRangeToCalendarDays(fromDate: DateTime, toDate: DateTime): string[] {
  const days: string[] = []

  let cursor = fromDate.startOf("day")
  const end = toDate.startOf("day")

  while (cursor <= end) {
    days.push(cursor.toFormat("yyyy-MM-dd"))
    cursor = cursor.plus({ days: 1 })
  }

  return days
}

function parseAndValidateRange(dateRange: IDateRangeDTO, label: string): { fromDate: DateTime; toDate: DateTime } {
  const fromRaw = dateRange.from ?? ""
  const toRaw = dateRange.to ?? ""

  const fromDate = DateTime.fromISO(fromRaw, { zone: TIME_ZONE })
  const toDate = DateTime.fromISO(toRaw, { zone: TIME_ZONE })

  if (!fromDate.isValid || !toDate.isValid) {
    throw new Error(`INVALID_DATE_RANGE: ${label}`)
  }

  if (fromDate > toDate) {
    throw new Error(`INVALID_DATE_RANGE: ${label}`)
  }

  return { fromDate, toDate }
}
