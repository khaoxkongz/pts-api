import {
  AllowanceSourceRequestError,
  type AllowanceSource,
  type IAllowanceApiResponse,
  type IAllowancePreviewRecord,
  type IAllowanceSourceConfig,
} from "./type.js"

export async function fetchAllRowsBySourceAndEmployee({
  source,
  employeeId,
  startDate,
  endDate,
  config,
}: {
  source: AllowanceSource
  employeeId: string
  startDate: string
  endDate: string
  config: IAllowanceSourceConfig
}): Promise<IAllowancePreviewRecord[]> {
  const rows: IAllowancePreviewRecord[] = []
  let currentPage = 1
  let lastPage = 1

  while (currentPage <= lastPage) {
    const { rows: pageRows, lastPage: pageLastPage } = await fetchPage({
      source,
      employeeId,
      startDate,
      endDate,
      page: currentPage,
      config,
    })

    rows.push(...pageRows)
    lastPage = pageLastPage
    currentPage += 1
  }

  return rows
}

async function fetchPage({
  source,
  employeeId,
  startDate,
  endDate,
  page,
  config,
}: {
  source: AllowanceSource
  employeeId: string
  startDate: string
  endDate: string
  page: number
  config: IAllowanceSourceConfig
}): Promise<{ rows: IAllowancePreviewRecord[]; lastPage: number }> {
  const endpoint = source === "WF" ? "/bi/planner_tag_system_wf/v1" : "/bi/planner_tag_system_dwf/v1"
  const params = new URLSearchParams({
    page: String(page),
    limit: "1000",
    start_date: startDate,
    end_date: endDate,
    emp_id: employeeId,
  })
  const url = `${config.baseUrl}${endpoint}?${params.toString()}`
  const basic = Buffer.from(`${config.user}:${config.pass}`).toString("base64")

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Basic ${basic}`,
      },
    },
    {
      timeoutMs: config.timeoutMs,
      source,
      employeeId,
    }
  )

  const payload = (await response.json()) as IAllowanceApiResponse

  if (!Array.isArray(payload.data)) {
    throw new AllowanceSourceRequestError({
      source,
      employeeId,
      code: `ALLOWANCE_SOURCE_INVALID_RESPONSE_${source}`,
    })
  }

  const rows = payload.data
    .map((item) => normalizeRow(source, item))
    .filter((row): row is IAllowancePreviewRecord => row !== null)

  return {
    rows,
    lastPage: payload.lastPage ?? 1,
  }
}

function normalizeRow(source: AllowanceSource, item: unknown): IAllowancePreviewRecord | null {
  if (!item || typeof item !== "object") {
    return null
  }

  const data = item as Record<string, unknown>
  const employeeId = String(data.emp_id ?? "").trim()

  if (!employeeId) {
    return null
  }

  const updateAt = String(data.update_at ?? "")
  const usedRaw = data.total_amount ?? data.total
  const budgetRaw = data.budget ?? data.budget_per_month
  const documentStatus = String(data.document_status ?? "").trim()

  return {
    source,
    employeeId,
    usedAmount: parseNumber(usedRaw),
    monthlyBudget: parseNumber(budgetRaw),
    documentStatus,
    updateAt,
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  context: { timeoutMs: number; source: AllowanceSource; employeeId: string }
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), context.timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })

    if (!response.ok) {
      throw new AllowanceSourceRequestError({
        source: context.source,
        employeeId: context.employeeId,
        code: `ALLOWANCE_SOURCE_HTTP_${response.status}`,
      })
    }

    return response
  } catch (error) {
    if (error instanceof AllowanceSourceRequestError) {
      throw error
    }

    const isAbort = error instanceof Error && error.name === "AbortError"
    if (isAbort) {
      throw new AllowanceSourceRequestError({
        source: context.source,
        employeeId: context.employeeId,
        code: `ALLOWANCE_SOURCE_TIMEOUT_${context.timeoutMs}MS`,
        cause: error,
      })
    }

    throw new AllowanceSourceRequestError({
      source: context.source,
      employeeId: context.employeeId,
      code: `ALLOWANCE_SOURCE_FETCH_ERROR_${context.source}`,
      cause: error,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value !== "string") {
    return 0
  }

  const parsed = Number(value.replaceAll(",", ""))
  return Number.isFinite(parsed) ? parsed : 0
}
