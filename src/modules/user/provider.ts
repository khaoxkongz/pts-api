import env from "@/env.js"

import { parseSubordinatesResponse } from "./logic.js"

// 60 seconds --> 60 * 1000 milliseconds
// In javascript, 1000 milliseconds = 1 second
const TIMEOUT_MS = 60_000

export async function getUserSubordinatesByLeaderId(leaderId: string) {
  const url = "https://ra.one.th/api/vMonk/externalApi/subordinateByLeaderId"
  const init = {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RA_AUTHENTICATE_API_KEY}`,
    },
    body: JSON.stringify({ employeeId: leaderId, option: "A" }),
  }

  const response = await fetchWithTimeout(url, init)
  const text = await response.text().catch((error) => `<<failed to read body: ${error?.message ?? error}>>`)

  if (!response.ok) {
    throw new Error(`Failed to fetch user subordinates data: ${response.status} ${response.statusText} - body: ${text}`)
  }

  try {
    const data = JSON.parse(text)
    return await parseSubordinatesResponse(data, leaderId)
  } catch (error) {
    throw new TypeError(`Failed to parse user subordinates JSON: ${text}`, { cause: error })
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
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
