/**
 * The raw session token for the notification stream: the x-authorized-token
 * header, then ?token= (a browser EventSource cannot send headers). The signed
 * cookie is passed to resolveSessionUser separately. See ADR-0001.
 */
export function streamRawToken(
  headers: Record<string, string | undefined>,
  query: { token?: string | undefined }
): string | null {
  return headers["x-authorized-token"] || query.token || null
}
