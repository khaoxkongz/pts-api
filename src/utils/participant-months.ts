// Webhook rounds upsert monthsClaimed per re-claim, so DB order is arrival order, not month order.
// Raw .lean() reads (unlike planner DTO's toPlannerDto) skip that sort, so callers must sort here.
// monthsClaimed can now hold several entries per month (one per transaction_id), so ties on month
// are broken by transaction_id for a deterministic, run-to-run stable order. Planned `months` have
// no transaction_id -> the tie-break is always "" vs "" -> a no-op there.
export function byMonthAsc<T extends { month?: string; transaction_id?: string }>(months?: T[] | null): T[] {
  return [...(months ?? [])].sort((a, b) => {
    const byMonth = (a.month ?? "").localeCompare(b.month ?? "")
    if (byMonth !== 0) return byMonth
    return (a.transaction_id ?? "").localeCompare(b.transaction_id ?? "")
  })
}

export function sortParticipantMonths<P extends { months?: unknown[]; monthsClaimed?: unknown[] }>(
  participants?: P[] | null
): P[] {
  return (participants ?? []).map((p) => ({
    ...p,
    months: byMonthAsc(p.months as { month?: string }[] | undefined),
    monthsClaimed: byMonthAsc(p.monthsClaimed as { month?: string }[] | undefined),
  }))
}
