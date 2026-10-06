import { DateTime } from "luxon"

import { type TAllowancePolicy } from "@/models/allowance-policy.js"

import * as AllowancePolicyStore from "./store.js"
import {
  type IAllowancePolicyPatchInput,
  type IAllowancePolicySeedInput,
  type IAllowancePolicyInput,
  type IAllowancePolicyYearMigrationInput,
  type IAllowancePolicyYearMigrationResult,
} from "./type.js"

const TIME_ZONE = "Asia/Bangkok"
const SPACE_REGEXP = /\s+/g
const DEFAULT_OPERATION_DAILY_RATE = 400
const DEFAULT_OPERATION_MONTHLY_LIMIT = 3000
const DEFAULT_POLICY_EFFECTIVE_FROM = new Date("2000-01-01T00:00:00.000Z")
const FALLBACK_OPERATION_KEYS = new Set(["", "default", "senior", "junior", "operation", "operator"])

interface IAllowancePolicyDocLike extends Partial<TAllowancePolicy> {
  _id?: unknown
  createdAt?: Date
  updatedAt?: Date
}

export function normalizePositionLevel(value: string): string {
  return value.trim().toLowerCase().replaceAll(".", " ").replace(SPACE_REGEXP, " ")
}

export function toPolicyDto(policy: IAllowancePolicyDocLike) {
  return {
    id: String(policy._id ?? ""),
    positionKey: policy.positionKey ?? "",
    aliases: policy.aliases ?? [],
    groupNameTh: policy.groupNameTh ?? "",
    dailyRate: policy.dailyRate ?? 0,
    monthlyLimit: policy.monthlyLimit ?? 0,
    effectiveFrom: toISODateTimeRequired(policy.effectiveFrom),
    effectiveTo: toISODateTime(policy.effectiveTo),
    isActive: policy.isActive ?? false,
    deletedAt: toISODateTime(policy.deletedAt),
    createdBy: policy.createdBy ?? "",
    updatedBy: policy.updatedBy ?? "",
    createdAt: toISODateTimeRequired(policy.createdAt),
    updatedAt: toISODateTimeRequired(policy.updatedAt),
  }
}

export async function listPolicies(query: { includeDeleted: boolean; includeInactive: boolean }) {
  const filter: Record<string, unknown> = {}

  if (!query.includeDeleted) {
    filter.deletedAt = null
  }
  if (!query.includeInactive) {
    filter.isActive = true
  }

  const policies = await AllowancePolicyStore.findPolicies(filter)
  return policies.map(toPolicyDto)
}

export async function createPolicy(input: IAllowancePolicyInput, actorAccountId: string) {
  const created = await AllowancePolicyStore.createPolicy({
    positionKey: normalizePositionLevel(input.positionKey),
    aliases: input.aliases.map(normalizePositionLevel),
    groupNameTh: input.groupNameTh,
    dailyRate: input.dailyRate,
    monthlyLimit: input.monthlyLimit,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    isActive: input.isActive,
    deletedAt: null,
    createdBy: actorAccountId,
    updatedBy: actorAccountId,
  })

  return toPolicyDto(created.toObject())
}

export async function patchPolicy(
  policyId: string,
  input: IAllowancePolicyPatchInput,
  actorAccountId: string
): Promise<ReturnType<typeof toPolicyDto> | null> {
  const update = buildPatchPolicyUpdate(input, actorAccountId)

  const updated = await AllowancePolicyStore.updatePolicyById(policyId, { $set: update })
  if (!updated) {
    return null
  }

  return toPolicyDto(updated)
}

export async function softDeletePolicy(policyId: string, actorAccountId: string) {
  const deleted = await AllowancePolicyStore.updatePolicyById(policyId, {
    $set: {
      isActive: false,
      deletedAt: new Date(),
      updatedBy: actorAccountId,
    },
  })

  if (!deleted) {
    return null
  }

  return toPolicyDto(deleted)
}

export async function seedDefaultPolicies(actorAccountId: string) {
  const now = new Date()
  let upsertedCount = 0

  for (const seed of buildDefaultPolicySeeds()) {
    await AllowancePolicyStore.findOneAndUpsertPolicy(
      {
        positionKey: normalizePositionLevel(seed.positionKey),
        effectiveFrom: seed.effectiveFrom,
      },
      {
        $set: {
          aliases: seed.aliases.map(normalizePositionLevel),
          groupNameTh: seed.groupNameTh,
          dailyRate: seed.dailyRate,
          monthlyLimit: seed.monthlyLimit,
          effectiveTo: seed.effectiveTo,
          isActive: true,
          deletedAt: null,
          updatedBy: actorAccountId,
          updatedAt: now,
        },
        $setOnInsert: {
          createdBy: actorAccountId,
          createdAt: now,
        },
      }
    )
    upsertedCount += 1
  }

  return { upsertedCount }
}

export async function migratePoliciesToYear(
  input: IAllowancePolicyYearMigrationInput,
  actorAccountId: string
): Promise<IAllowancePolicyYearMigrationResult> {
  const migrationWindow = resolveMigrationWindow(input)
  const sourcePolicies = await AllowancePolicyStore.findPolicies({
    deletedAt: null,
    isActive: true,
    effectiveFrom: { $lte: migrationWindow.sourceAnchor.toJSDate() },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: migrationWindow.sourceAnchor.toJSDate() } }],
  })
  const latestPolicies = takeLatestByPositionKey(sourcePolicies)
  const migrationResult = await migratePolicyVersions({
    policies: latestPolicies,
    closeAt: migrationWindow.closeAt,
    effectiveFrom: migrationWindow.effectiveFrom.toJSDate(),
    effectiveTo: input.effectiveTo,
    actorAccountId,
  })

  return {
    sourceYear: input.sourceYear,
    targetYear: input.targetYear,
    effectiveFrom: migrationWindow.effectiveFrom.toISODate() ?? "",
    effectiveTo: input.effectiveTo ? DateTime.fromJSDate(input.effectiveTo).toISODate() : null,
    sourcePolicies: latestPolicies.length,
    closedPolicies: migrationResult.closedPolicies,
    upsertedPolicies: migrationResult.upsertedPolicies,
  }
}

export async function getPoliciesForMonth(month: string) {
  const monthDate = DateTime.fromFormat(month, "yyyy-MM", { zone: TIME_ZONE })
  if (!monthDate.isValid) {
    throw new Error(`INVALID_MONTH: ${month}`)
  }

  const monthStart = monthDate.startOf("month").toJSDate()
  const monthEnd = monthDate.endOf("month").toJSDate()

  const policies = await AllowancePolicyStore.findPolicies({
    deletedAt: null,
    isActive: true,
    effectiveFrom: { $lte: monthEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: monthStart } }],
  })

  return policies as TAllowancePolicy[]
}

export function resolvePolicyForPositionInMonth(
  positionLevelRaw: string,
  monthPolicies: TAllowancePolicy[]
): {
  groupNameTh: string
  dailyRate: number
  monthlyLimit: number
} {
  const normalizedPosition = normalizePositionLevel(positionLevelRaw)
  const matched = findMatchedPolicy(monthPolicies, normalizedPosition)

  if (matched) {
    return {
      groupNameTh: matched.groupNameTh,
      dailyRate: matched.dailyRate,
      monthlyLimit: matched.monthlyLimit,
    }
  }

  const fallback = findOperationFallbackPolicy(monthPolicies)
  if (fallback) {
    return {
      groupNameTh: fallback.groupNameTh,
      dailyRate: fallback.dailyRate,
      monthlyLimit: fallback.monthlyLimit,
    }
  }

  return {
    groupNameTh: "ปฏิบัติการ",
    dailyRate: DEFAULT_OPERATION_DAILY_RATE,
    monthlyLimit: DEFAULT_OPERATION_MONTHLY_LIMIT,
  }
}

function findMatchedPolicy(monthPolicies: TAllowancePolicy[], normalizedPosition: string) {
  for (const policy of monthPolicies) {
    const candidates = new Set([
      normalizePositionLevel(policy.positionKey),
      ...policy.aliases.map(normalizePositionLevel),
    ])
    if (candidates.has(normalizedPosition)) {
      return policy
    }
  }
  return null
}

function findOperationFallbackPolicy(monthPolicies: TAllowancePolicy[]) {
  for (const policy of monthPolicies) {
    if (normalizePositionLevel(policy.groupNameTh) === normalizePositionLevel("ปฏิบัติการ")) {
      return policy
    }

    const candidates = [normalizePositionLevel(policy.positionKey), ...policy.aliases.map(normalizePositionLevel)]
    if (candidates.some((candidate) => FALLBACK_OPERATION_KEYS.has(candidate))) {
      return policy
    }
  }
  return null
}

function toISODateTime(value: Date | null | undefined) {
  if (!value) {
    return null
  }

  return value.toISOString()
}

function toISODateTimeRequired(value: Date | null | undefined) {
  return value ? value.toISOString() : ""
}

function resolveMigrationWindow(input: IAllowancePolicyYearMigrationInput) {
  if (input.sourceYear >= input.targetYear) {
    throw new Error("INVALID_YEAR_RANGE")
  }

  const sourceAnchor = DateTime.fromObject(
    { year: input.sourceYear, month: 12, day: 31, hour: 23, minute: 59, second: 59 },
    { zone: TIME_ZONE }
  )
  if (!sourceAnchor.isValid) {
    throw new Error("INVALID_SOURCE_YEAR")
  }

  const effectiveFrom = DateTime.fromJSDate(input.effectiveFrom, { zone: TIME_ZONE }).startOf("day")
  if (effectiveFrom.year !== input.targetYear) {
    throw new Error("EFFECTIVE_FROM_YEAR_MISMATCH")
  }

  return {
    sourceAnchor,
    effectiveFrom,
    closeAt: effectiveFrom.minus({ days: 1 }).endOf("day").toJSDate(),
  }
}

async function migratePolicyVersions(input: {
  policies: IAllowancePolicyDocLike[]
  closeAt: Date
  effectiveFrom: Date
  effectiveTo: Date | null
  actorAccountId: string
}) {
  let closedPolicies = 0
  let upsertedPolicies = 0

  for (const policy of input.policies) {
    if (await closePolicyVersionIfNeeded(policy, input.closeAt, input.actorAccountId)) {
      closedPolicies += 1
    }

    await upsertMigratedPolicyVersion({
      policy,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      actorAccountId: input.actorAccountId,
    })
    upsertedPolicies += 1
  }

  return { closedPolicies, upsertedPolicies }
}

async function closePolicyVersionIfNeeded(policy: IAllowancePolicyDocLike, closeAt: Date, actorAccountId: string) {
  const policyId = getPolicyId(policy)
  if (!policyId || !shouldCloseCurrentPolicy(policy, closeAt)) {
    return false
  }

  await AllowancePolicyStore.updatePolicyById(policyId, {
    $set: {
      effectiveTo: closeAt,
      updatedBy: actorAccountId,
    },
  })

  return true
}

async function upsertMigratedPolicyVersion(input: {
  policy: IAllowancePolicyDocLike
  effectiveFrom: Date
  effectiveTo: Date | null
  actorAccountId: string
}) {
  await AllowancePolicyStore.findOneAndUpsertPolicy(
    {
      positionKey: normalizePositionLevel(input.policy.positionKey ?? ""),
      effectiveFrom: input.effectiveFrom,
    },
    {
      $set: {
        aliases: (input.policy.aliases ?? []).map(normalizePositionLevel),
        groupNameTh: input.policy.groupNameTh ?? "",
        dailyRate: input.policy.dailyRate ?? 0,
        monthlyLimit: input.policy.monthlyLimit ?? 0,
        effectiveTo: input.effectiveTo,
        isActive: true,
        deletedAt: null,
        updatedBy: input.actorAccountId,
      },
      $setOnInsert: {
        createdBy: input.actorAccountId,
      },
    }
  )
}

function shouldCloseCurrentPolicy(policy: IAllowancePolicyDocLike, closeAt: Date) {
  if (!policy.effectiveTo) {
    return true
  }

  return policy.effectiveTo > closeAt
}

function takeLatestByPositionKey(policies: IAllowancePolicyDocLike[]) {
  const latestByPositionKey = new Map<string, IAllowancePolicyDocLike>()

  for (const policy of policies) {
    const positionKey = normalizePositionLevel(policy.positionKey ?? "")
    const currentLatest = latestByPositionKey.get(positionKey)
    if (!currentLatest) {
      latestByPositionKey.set(positionKey, policy)
      continue
    }

    const currentEffectiveFrom = currentLatest.effectiveFrom?.getTime() ?? 0
    const nextEffectiveFrom = policy.effectiveFrom?.getTime() ?? 0
    if (nextEffectiveFrom > currentEffectiveFrom) {
      latestByPositionKey.set(positionKey, policy)
    }
  }

  return [...latestByPositionKey.values()]
}

function getPolicyId(policy: IAllowancePolicyDocLike) {
  if (!policy._id) {
    return null
  }

  return String(policy._id)
}

function buildPatchPolicyUpdate(input: IAllowancePolicyPatchInput, actorAccountId: string) {
  return {
    updatedBy: actorAccountId,
    ...(input.positionKey === undefined ? {} : { positionKey: normalizePositionLevel(input.positionKey) }),
    ...(input.aliases === undefined ? {} : { aliases: input.aliases.map(normalizePositionLevel) }),
    ...(input.groupNameTh === undefined ? {} : { groupNameTh: input.groupNameTh }),
    ...(input.dailyRate === undefined ? {} : { dailyRate: input.dailyRate }),
    ...(input.monthlyLimit === undefined ? {} : { monthlyLimit: input.monthlyLimit }),
    ...(input.effectiveFrom === undefined ? {} : { effectiveFrom: input.effectiveFrom }),
    ...(input.effectiveTo === undefined ? {} : { effectiveTo: input.effectiveTo }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
  }
}

function buildDefaultPolicySeeds(): IAllowancePolicySeedInput[] {
  return [
    {
      positionKey: "senior",
      aliases: ["senior"],
      groupNameTh: "ปฏิบัติการ",
      dailyRate: 400,
      monthlyLimit: 3000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "junior",
      aliases: ["junior"],
      groupNameTh: "ปฏิบัติการ",
      dailyRate: 400,
      monthlyLimit: 3000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "operation",
      aliases: ["operation"],
      groupNameTh: "ปฏิบัติการ",
      dailyRate: 400,
      monthlyLimit: 3000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "operator",
      aliases: ["operator"],
      groupNameTh: "ปฏิบัติการ",
      dailyRate: 400,
      monthlyLimit: 3000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "default",
      aliases: [""],
      groupNameTh: "ปฏิบัติการ",
      dailyRate: 400,
      monthlyLimit: 3000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "ast manager",
      aliases: ["ast manager", "ast. manager", "assistant manager"],
      groupNameTh: "ผู้จัดการ",
      dailyRate: 500,
      monthlyLimit: 4000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "manager",
      aliases: ["manager"],
      groupNameTh: "ผู้จัดการ",
      dailyRate: 500,
      monthlyLimit: 4000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "gm",
      aliases: ["gm"],
      groupNameTh: "ผู้จัดการ",
      dailyRate: 500,
      monthlyLimit: 4000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "svp",
      aliases: ["svp"],
      groupNameTh: "บริหาร",
      dailyRate: 600,
      monthlyLimit: 5000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "avp",
      aliases: ["avp"],
      groupNameTh: "บริหาร",
      dailyRate: 600,
      monthlyLimit: 5000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "vp",
      aliases: ["vp"],
      groupNameTh: "บริหาร",
      dailyRate: 600,
      monthlyLimit: 5000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "md",
      aliases: ["md"],
      groupNameTh: "บริหารระดับสูง",
      dailyRate: 700,
      monthlyLimit: 7000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
    {
      positionKey: "dmd",
      aliases: ["dmd"],
      groupNameTh: "บริหารระดับสูง",
      dailyRate: 700,
      monthlyLimit: 7000,
      effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM,
      effectiveTo: null,
    },
  ]
}
