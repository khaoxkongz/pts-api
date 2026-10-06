import { DateTime } from "luxon"

import { type TPlanner } from "@/models/planner.js"
import { type estimatedBudget, type planner } from "@/modules/planner/model.js"
import { STATUS } from "@/utils/status/status.js"

export function safeDate(d?: Date | null): string | null {
  if (!d) {
    return null
  }
  return DateTime.fromJSDate(d).setZone("Asia/Bangkok").toFormat("yyyy-MM-dd")
}

export function safeDateTime(d?: Date | null): string | null {
  if (!d) {
    return null
  }
  return DateTime.fromJSDate(d).setZone("Asia/Bangkok").toFormat("yyyy-MM-dd HH:mm:ss")
}

export function formatUser(accountId: string, userMap: Map<string, unknown>) {
  const user = userMap.get(accountId) as { accountId: string; fullName: string }
  return user ? { accountId: user.accountId, name: user.fullName } : null
}

export function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

export function getStatusCount(statusStats: unknown[], targetStatus: string) {
  let totalCount = 0
  for (const s of statusStats as { _id: string | string[]; count: number }[]) {
    if (Array.isArray(s._id) ? s._id.includes(targetStatus) : s._id === targetStatus) {
      totalCount += s.count
    }
  }
  return totalCount
}

export function getStatusCounts(statusStats: unknown[], targetStatuses: string[]) {
  let totalCount = 0
  for (const s of statusStats as { _id: string | string[]; count: number }[]) {
    if (
      Array.isArray(s._id) ? s._id.some((status) => targetStatuses.includes(status)) : targetStatuses.includes(s._id)
    ) {
      totalCount += s.count
    }
  }
  return totalCount
}

export function calculateJvRatios(
  jvs: TPlanner["jvs"],
  estimate: (typeof estimatedBudget.static)[],
  currentEstimatedBudget: (typeof estimatedBudget.static)[],
  allowance: typeof planner.allowance.static
) {
  if (!jvs || jvs.length === 0) return []

  const jvCount = jvs.length

  let totalBudget =
    estimate.length > 0
      ? estimate.reduce((s, i) => s + (i.price || 0), 0)
      : currentEstimatedBudget.reduce((s, i) => s + (i.price || 0), 0)

  totalBudget += allowance
  const totalCents = Math.round(totalBudget * 100)

  const basePercent = Math.floor(100 / jvCount)
  let percentRemainder = 100 - basePercent * jvCount

  const percents = jvs.map(() => {
    let p = basePercent
    if (percentRemainder > 0) {
      p += 1
      percentRemainder--
    }
    return p
  })

  let allocated = 0
  let centsPerJv: number[] = []

  centsPerJv = percents.map((p) => {
    const share = Math.floor((totalCents * p) / 100)
    allocated += share
    return share
  })

  let remainder = totalCents - allocated
  for (let i = 0; remainder > 0; i++) {
    if (centsPerJv[i] !== undefined && centsPerJv[i] !== null) {
      centsPerJv[i]! += 1
      remainder--
    }
  }

  return jvs.map((jv, index) => ({
    ...jv,
    percentageRatio: percents[index],
    expenseRatio: centsPerJv[index]! / 100,
    status: STATUS.WAITING_JV_APPROVAL,
  }))
}
