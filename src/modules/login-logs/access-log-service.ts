import * as AccessLogStore from "./access-log-store.js"
import { toHolder, toQueryRecord } from "./logic.js"
import { buildAccessLogQuery } from "./query-builder.js"
import { type IAccessLogQueryDTO } from "./type.js"

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50

export async function getAccessLogs(query: IAccessLogQueryDTO) {
  const page = query.page ?? DEFAULT_PAGE
  const limit = query.limit ?? DEFAULT_LIMIT
  const match = buildAccessLogQuery(query)

  const { items, total } = await AccessLogStore.findAccessLogs(match, page, limit)

  return {
    items: items.map((item) => ({
      id: String(item._id),
      caller: item.caller ? toHolder(item.caller) : null,
      key_id: item.key_id ?? null,
      key_prefix: item.key_prefix ?? null,
      method: item.method,
      path: item.path,
      query: toQueryRecord(item.query),
      status_code: item.status_code,
      result_count: item.result_count,
      ip: item.ip,
      user_agent: item.user_agent,
      duration_ms: item.duration_ms,
      requestedAt: new Date(item.requestedAt).toISOString(),
      requestedAtTh: item.requestedAtTh,
    })),
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  }
}
