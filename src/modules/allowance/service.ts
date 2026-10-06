import { DateTime } from "luxon"

import { EmployeeRA } from "@/models/employee-ra.js"
import * as AllowancePolicyService from "@/modules/allowance-policy/service.js"

import { resolveMonthlyQueryRanges } from "./logic.js"
import { fetchAllRowsBySourceAndEmployee } from "./provider.js"
import {
  AllowanceSourceRequestError,
  createAllowancePreviewAggregateError,
  type AllowanceSource,
  type IAllowancePreviewRecord,
  type IAllowancePreviewResult,
  type IAllowanceSourceConfig,
  type IAllowanceSourceFailure,
} from "./type.js"

const SOURCES: AllowanceSource[] = ["WF", "DWF"]
const DEFAULT_POLICY_GROUP = "ปฏิบัติการ"

type TMonthlyUsedAmountMap = Map<string, Map<string, number>>

export async function previewAllowanceRecords(input: {
  employeeId: string
  startDate: string
  endDate: string
  config: IAllowanceSourceConfig
}): Promise<IAllowancePreviewResult> {
  const { employeeId } = input
  const monthlyRanges = resolveMonthlyQueryRanges({
    startDate: input.startDate,
    endDate: input.endDate,
  })
  const monthlyUsedAmountMap: TMonthlyUsedAmountMap = new Map()
  const tasks = SOURCES.flatMap((source) =>
    monthlyRanges.map(async (monthlyRange) => {
      try {
        const rows = await fetchAllRowsBySourceAndEmployee({
          source,
          employeeId,
          startDate: monthlyRange.startDate,
          endDate: monthlyRange.endDate,
          config: input.config,
        })

        return {
          ok: true as const,
          rows,
          employeeId,
          month: monthlyRange.month,
        }
      } catch (error) {
        if (error instanceof AllowanceSourceRequestError) {
          return {
            ok: false as const,
            error: { source: error.source, employeeId: error.employeeId, code: error.code },
          }
        }

        return {
          ok: false as const,
          error: { source, employeeId, code: "ALLOWANCE_SOURCE_UNKNOWN_ERROR" },
        }
      }
    })
  )

  const settled = await Promise.all(tasks)
  const failures: IAllowanceSourceFailure[] = []
  const records: IAllowancePreviewRecord[] = []

  for (const result of settled) {
    if (!result.ok) {
      failures.push(result.error)
      continue
    }

    records.push(...result.rows)
  }

  if (failures.length > 0) {
    throw createAllowancePreviewAggregateError(failures)
  }

  const updatedAtMap = new Map<string, string>()

  for (const record of records) {
    if (record.documentStatus === "Y") {
      const parsedUpdateAt = DateTime.fromFormat(record.updateAt, "yyyy-MM-dd HH:mm:ss").toISO()

      if (!parsedUpdateAt) {
        continue
      }

      const employeeId = record.employeeId
      const month = DateTime.fromFormat(record.updateAt, "yyyy-MM-dd HH:mm:ss").toFormat("yyyy-MM")
      const employeeMonths = monthlyUsedAmountMap.get(employeeId) ?? new Map<string, number>()

      updatedAtMap.set(
        month,
        parsedUpdateAt > (updatedAtMap.get(month) ?? "") ? parsedUpdateAt : (updatedAtMap.get(month) ?? "")
      )
      const currentAmount = employeeMonths.get(month) ?? 0
      employeeMonths.set(month, currentAmount + record.usedAmount)
    }
  }

  for (const record of records) {
    if (record.documentStatus === "Y") {
      const parsedUpdateAt = DateTime.fromFormat(record.updateAt, "yyyy-MM-dd HH:mm:ss").toISO()

      if (!parsedUpdateAt) {
        continue
      }

      const employeeId = record.employeeId
      const month = DateTime.fromFormat(record.updateAt, "yyyy-MM-dd HH:mm:ss").toFormat("yyyy-MM")

      const employeeMonths = monthlyUsedAmountMap.get(employeeId) ?? new Map<string, number>()

      const currentAmount = employeeMonths.get(month) ?? 0
      const newAmount = currentAmount + record.usedAmount

      employeeMonths.set(month, newAmount)
      monthlyUsedAmountMap.set(employeeId, employeeMonths)
    }
  }

  const summary = await buildAllowanceSummary({
    employeeId,
    months: monthlyRanges.map((range) => range.month),
    monthlyUsedAmountMap,
    updatedAtMap,
  })

  return {
    summary,
  }
}

async function buildAllowanceSummary(input: {
  employeeId: string
  months: string[]
  monthlyUsedAmountMap: TMonthlyUsedAmountMap
  updatedAtMap: Map<string, string>
}) {
  const employeePositionMap = await loadEmployeePositionLevels(input.employeeId)
  const policiesByMonth = await loadPoliciesByMonth(input.months)

  const positionLevelRaw = employeePositionMap.get(input.employeeId) ?? ""
  const months = input.months.map((month) => {
    const monthPolicies = policiesByMonth.get(month) ?? []
    const policy = AllowancePolicyService.resolvePolicyForPositionInMonth(positionLevelRaw, monthPolicies)
    const allowanceAccum = getAccumulatedUsedAmount(input.monthlyUsedAmountMap, input.employeeId, month)

    const updateAt = input.updatedAtMap.get(month)
      ? DateTime.fromISO(input.updatedAtMap.get(month) ?? "").toFormat("yyyy-MM-dd HH:mm:ss")
      : "-"

    return {
      month,
      allowanceMonthly: policy.monthlyLimit,
      allowanceDaily: policy.dailyRate,
      allowanceAccum: allowanceAccum,
      allowanceRemaining: Math.max(0, policy.monthlyLimit - allowanceAccum),
      updatedAt: updateAt,
    }
  })

  return {
    employeeId: input.employeeId,
    positionLevelRaw,
    positionPolicyGroup: getPolicyGroupForMonth(positionLevelRaw, input.months[0], policiesByMonth),
    months,
  }
}

function getPolicyGroupForMonth(
  positionLevelRaw: string,
  month: string | undefined,
  policiesByMonth: Map<string, Awaited<ReturnType<typeof AllowancePolicyService.getPoliciesForMonth>>>
) {
  if (!month) {
    return DEFAULT_POLICY_GROUP
  }

  const monthPolicies = policiesByMonth.get(month) ?? []
  return AllowancePolicyService.resolvePolicyForPositionInMonth(positionLevelRaw, monthPolicies).groupNameTh
}

function getAccumulatedUsedAmount(monthlyUsedAmountMap: TMonthlyUsedAmountMap, employeeId: string, month: string) {
  return monthlyUsedAmountMap.get(employeeId)?.get(month) ?? 0
}

async function loadEmployeePositionLevels(employeeId: string) {
  const employee = await EmployeeRA.findOne({ employeeId }).select({ _id: 0, employeeId: 1, positionLevel: 1 }).lean()

  const employeePositionMap = new Map<string, string>()
  if (employee) {
    employeePositionMap.set(employee.employeeId, employee.positionLevel ?? "")
  }

  return employeePositionMap
}

async function loadPoliciesByMonth(months: string[]) {
  const uniqueMonths = [...new Set(months)]
  const policies = await Promise.all(
    uniqueMonths.map(async (month) => ({
      month,
      policies: await AllowancePolicyService.getPoliciesForMonth(month),
    }))
  )

  const policiesByMonth = new Map<string, Awaited<ReturnType<typeof AllowancePolicyService.getPoliciesForMonth>>>()
  for (const policyByMonth of policies) {
    policiesByMonth.set(policyByMonth.month, policyByMonth.policies)
  }

  return policiesByMonth
}
