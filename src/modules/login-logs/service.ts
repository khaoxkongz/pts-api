import { formatBangkokDateTime } from "./format-date.js"
import * as LoginLogsStore from "./store.js"

export async function getLoginLogs() {
  const loginLogs = await LoginLogsStore.getLoginLogs()
  const lastLogins = await LoginLogsStore.getLastLoginByAccount(loginLogs.map((log) => log.account_id))

  const lastLoginMap = new Map(lastLogins.map((l) => [l.account_id, l.updatedAt]))

  return loginLogs
    .map((log) => ({
      ...log,
      updatedAt: lastLoginMap.get(log.account_id) ?? null,
    }))
    .filter((log): log is typeof log & { updatedAt: string } => log.updatedAt !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((log) => ({ ...log, updatedAtFormatted: formatBangkokDateTime(log.updatedAt) }))
}
