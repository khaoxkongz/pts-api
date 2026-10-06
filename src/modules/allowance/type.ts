export type AllowanceSource = "WF" | "DWF"

export interface IAllowanceSourceConfig {
  baseUrl: string
  user: string
  pass: string
  timeoutMs: number
}

export interface IAllowanceApiResponse {
  data?: unknown[]
  lastPage?: number
}

export interface IAllowancePreviewInput {
  employeeId: string
  startDate: string
  endDate: string
}

export interface IAllowancePreviewRecord {
  source: AllowanceSource
  employeeId: string
  usedAmount: number
  monthlyBudget: number
  documentStatus: string
  updateAt: string
}

export interface IAllowancePreviewSummaryMonth {
  month: string
  allowanceMonthly: number
  allowanceDaily: number
  allowanceAccum: number
  allowanceRemaining: number
  updatedAt: string
}

export interface IAllowancePreviewSummaryEmployee {
  employeeId: string
  positionLevelRaw: string
  positionPolicyGroup: string
  months: IAllowancePreviewSummaryMonth[]
}

export interface IAllowancePreviewSummary {
  employees: IAllowancePreviewSummaryEmployee[]
}

export interface IAllowancePreviewResult {
  summary: IAllowancePreviewSummaryEmployee
}

export interface IAllowanceSourceFailure {
  source: AllowanceSource
  employeeId: string
  code: string
}

export class AllowanceSourceRequestError extends Error {
  source: AllowanceSource
  employeeId: string
  code: string

  constructor({
    source,
    employeeId,
    code,
    cause,
  }: {
    source: AllowanceSource
    employeeId: string
    code: string
    cause?: unknown
  }) {
    super(code, { cause })
    this.name = "AllowanceSourceRequestError"
    this.source = source
    this.employeeId = employeeId
    this.code = code
  }
}

export interface IAllowancePreviewAggregateError extends Error {
  errors: IAllowanceSourceFailure[]
}

export function createAllowancePreviewAggregateError(
  errors: IAllowanceSourceFailure[]
): IAllowancePreviewAggregateError {
  const error = new Error("ALLOWANCE_PREVIEW_UPSTREAM_FAILED") as IAllowancePreviewAggregateError
  error.name = "AllowancePreviewAggregateError"
  error.errors = errors
  return error
}

export function isAllowancePreviewAggregateError(error: unknown): error is IAllowancePreviewAggregateError {
  if (!(error instanceof Error) || error.name !== "AllowancePreviewAggregateError") {
    return false
  }

  const withErrors = error as { errors?: unknown }
  return Array.isArray(withErrors.errors)
}
