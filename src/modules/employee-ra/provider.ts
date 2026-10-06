import env from "@/env.js"
import { type CompanyJVResponse } from "@/types/company-jv.js"
import {
  type EmployeeDetailsResponse,
  type EmployeeRAResponse,
  type SubordinateListResponse,
} from "@/types/employee-ra.js"

export async function getCompanyJV() {
  const url = "https://ra.one.th/api/vMonk/externalApi/countEmployees"
  const init = {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_AUTHENTICATE_API_KEY}`,
    },
  }

  const response = await fetchWithTimeout(url, init)
  return handleResponse<CompanyJVResponse>(response, "Failed to fetch company JV data")
}

export async function getEmployeeDetailsByAccountId(accountId: string) {
  if (!env.RA_AUTHENTICATE_API_KEY) {
    throw new Error("Missing RA_AUTHENTICATE_API_KEY in environment")
  }

  const url = "https://ra.one.th/api/vMonk/externalApi/detailUserByAccountId"
  const init = {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_AUTHENTICATE_API_KEY}`,
    },
    body: JSON.stringify({ accountId: accountId }),
  }

  const response = await fetchWithTimeout(url, init)
  return handleResponse<EmployeeDetailsResponse>(response, "Failed to fetch employee details")
}

export async function getSubordinatesBySupervisorEmployeeId(supervisorEmployeeId: string) {
  if (!env.RA_AUTHENTICATE_API_KEY) {
    throw new Error("Missing RA_AUTHENTICATE_API_KEY in environment")
  }

  const url = "https://ra.one.th/api/vMonk/externalApi/subordinateByLeaderId"
  const init = {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_AUTHENTICATE_API_KEY}`,
    },
    body: JSON.stringify({ employeeId: supervisorEmployeeId, option: "A" }),
  }

  const response = await fetchWithTimeout(url, init)
  return handleResponse<SubordinateListResponse>(response, "Failed to fetch subordinates")
}

export async function getEmployeeRaFromTaxID(taxId: string) {
  const url = new URL("https://ra.one.th/api/vMonk/externalApi/userListByTaxId")
  url.searchParams.append("taxId", taxId)

  const init = {
    method: "GET",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_AUTHENTICATE_API_KEY}`,
    },
  }

  const response = await fetchWithTimeout(url.toString(), init)
  return handleResponse<EmployeeRAResponse>(response, "Failed to fetch employee RA data")
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError"
    const message = isAbort
      ? `Request to ${url} aborted after ${timeoutMs}ms`
      : `Network error fetching data: ${error instanceof Error ? error.message : String(error)}`

    throw new Error(message, { cause: error })
  } finally {
    clearTimeout(timeout)
  }
}

async function handleResponse<T>(response: Response, errorMessagePrefix: string): Promise<T> {
  const text = await response.text().catch((error) => `<<failed to read body: ${error?.message ?? error}>>`)

  if (!response.ok) {
    throw new Error(`${errorMessagePrefix}: ${response.status} ${response.statusText} - body: ${text}`)
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(`Failed to parse JSON for ${errorMessagePrefix}: ${text}`, { cause: error })
  }
}
