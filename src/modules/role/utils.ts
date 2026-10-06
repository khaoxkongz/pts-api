import { DateTime } from "luxon"

export function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

export function safeDate(d?: Date | null): string | null {
  if (!d) {
    return null
  }
  return DateTime.fromJSDate(d).setZone("Asia/Bangkok").toFormat("yyyy-MM-dd")
}
