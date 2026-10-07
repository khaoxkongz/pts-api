import { type AppBadgeMessage, type AppPushMessage, type OnePlatform } from "./app-push.js"

interface OnePlatformClientOptions {
  // Ends with a slash, like https://platform.one.th/manage/api/
  baseUrl: string
  token: string
  timeoutMs: number
}

export class OnePlatformRequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "OnePlatformRequestError"
  }
}

// The production OnePlatform: a call succeeds only when the HTTP response is ok and the body's status is 200.
export function createOnePlatformClient({ baseUrl, token, timeoutMs }: OnePlatformClientOptions): OnePlatform {
  async function call(method: "POST" | "PUT", path: string, body: unknown): Promise<void> {
    const url = new URL(path, baseUrl).toString()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await response.text()
      const status = parseBodyStatus(text)

      if (!response.ok || status !== 200) {
        throw new OnePlatformRequestError(
          `${method} ${path} failed: HTTP ${response.status}, body status ${status ?? "missing"}: ${text.slice(0, 500)}`
        )
      }
    } catch (error) {
      if (error instanceof OnePlatformRequestError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new OnePlatformRequestError(`${method} ${path} timed out after ${timeoutMs}ms`, { cause: error })
      }
      throw new OnePlatformRequestError(`${method} ${path} failed`, { cause: error })
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async pushNotifyToApp(message: AppPushMessage) {
      await call("POST", "v2/service/push-notify-to-app", message)
    },
    async setBadge(message: AppBadgeMessage) {
      await call("PUT", "v1/service/set-badge", message)
    },
  }
}

function parseBodyStatus(text: string): number | null {
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === "object" && "status" in body) {
      const status = Number(body.status)
      return Number.isFinite(status) ? status : null
    }
    return null
  } catch {
    return null
  }
}
