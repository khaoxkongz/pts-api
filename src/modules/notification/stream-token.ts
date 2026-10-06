// Header first (even when empty), then ?token=, since a browser EventSource cannot send headers (ADR-0001).
export function streamRawToken(
  headers: Record<string, string | undefined>,
  query: { token?: string | undefined }
): string | null {
  return headers["x-authorized-token"] ?? query.token ?? null
}
