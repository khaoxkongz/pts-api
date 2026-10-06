export interface IAllowancePolicyInput {
  positionKey: string
  aliases: string[]
  groupNameTh: string
  dailyRate: number
  monthlyLimit: number
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}

export interface IAllowancePolicyPatchInput {
  positionKey?: string
  aliases?: string[]
  groupNameTh?: string
  dailyRate?: number
  monthlyLimit?: number
  effectiveFrom?: Date
  effectiveTo?: Date | null
  isActive?: boolean
}

export interface IAllowancePolicySeedInput {
  positionKey: string
  aliases: string[]
  groupNameTh: string
  dailyRate: number
  monthlyLimit: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

export interface IAllowancePolicyYearMigrationInput {
  sourceYear: number
  targetYear: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

export interface IAllowancePolicyYearMigrationResult {
  sourceYear: number
  targetYear: number
  effectiveFrom: string
  effectiveTo: string | null
  sourcePolicies: number
  closedPolicies: number
  upsertedPolicies: number
}
