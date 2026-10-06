import { PARTICIPANT_STATUS, type ParticipantStatus } from "@/modules/webhook/logic.js"

export const PENDING_CONFIRM_DAYS = 5
const DAY_MS = 24 * 60 * 60 * 1000

// Absolute confirm deadline, computed when a participant enters a transient pending state.
// The deadline lives on the record, so the sweep only compares it to "now".
export function pendingConfirmExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + PENDING_CONFIRM_DAYS * DAY_MS)
}

export function employeeIdsOverlap(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a)
  return b.some((id) => set.has(id))
}

// Transient pending states awaiting confirmation, mapped to the terminal state they confirm to.
export const PENDING_CONFIRM_TRANSITIONS = {
  [PARTICIPANT_STATUS.PENDING_REJECT]: PARTICIPANT_STATUS.REJECT,
  [PARTICIPANT_STATUS.PENDING_CANCEL]: PARTICIPANT_STATUS.CANCEL,
} as const satisfies Partial<Record<ParticipantStatus, ParticipantStatus>>

// Terminal outcomes — they no longer block finalization and are never resurrected.
function isResolved(status: string): boolean {
  return (
    status === PARTICIPANT_STATUS.APPROVE ||
    status === PARTICIPANT_STATUS.REJECT ||
    status === PARTICIPANT_STATUS.CANCEL
  )
}

// Display rollup: a participant's single status, derived from its per-month claimed statuses. Any
// non-terminal month keeps the participant non-terminal (most-active wins). Falls back to the stored
// status when there are no claimed months (initial PENDING) or when the months predate per-month
// status (legacy documents) — so an old fully-approved participant still rolls up to APPROVE.
// Once any month has a claimed entry, a PLANNED month (`months`) with no claimed entry yet has not
// started its webhook, so it counts as PENDING — e.g. May cancelled pre-webhook while June is still
// unclaimed keeps the participant non-terminal instead of rolling up to CANCEL.
export function rollupParticipantStatus(participant: {
  status?: string
  months?: Array<{ month?: string | null }>
  monthsClaimed?: Array<{ month?: string | null; status?: string | null }>
}): string {
  const claimed = participant.monthsClaimed ?? []
  const statuses = claimed.map((m) => m.status ?? "").filter((s) => s !== "")
  if (statuses.length === 0) return participant.status ?? PARTICIPANT_STATUS.PENDING
  const claimedMonths = new Set(claimed.map((m) => m.month))
  if ((participant.months ?? []).some((m) => !claimedMonths.has(m.month))) statuses.push(PARTICIPANT_STATUS.PENDING)
  if (statuses.includes(PARTICIPANT_STATUS.WAIT)) return PARTICIPANT_STATUS.WAIT
  if (statuses.includes(PARTICIPANT_STATUS.PENDING_REJECT)) return PARTICIPANT_STATUS.PENDING_REJECT
  if (statuses.includes(PARTICIPANT_STATUS.PENDING_CANCEL)) return PARTICIPANT_STATUS.PENDING_CANCEL
  if (statuses.includes(PARTICIPANT_STATUS.PENDING)) return PARTICIPANT_STATUS.PENDING
  if (statuses.includes(PARTICIPANT_STATUS.APPROVE)) return PARTICIPANT_STATUS.APPROVE
  if (statuses.includes(PARTICIPANT_STATUS.REJECT)) return PARTICIPANT_STATUS.REJECT
  if (statuses.includes(PARTICIPANT_STATUS.CANCEL)) return PARTICIPANT_STATUS.CANCEL
  return participant.status ?? PARTICIPANT_STATUS.PENDING
}

// Roll up the per-entry statuses of ONE month's claimed entries to a single display status, using
// the exact same precedence as rollupParticipantStatus (reused, not re-implemented). Returns
// undefined when no entry carries a status (empty / legacy months) so the DTO can omit the field —
// matching today's `month.status ? ... : undefined` shape for single-entry months.
export function rollupMonthStatus(statuses: Array<string | null | undefined>): string | undefined {
  const present = statuses.map((s) => s ?? "").filter((s) => s !== "")
  if (present.length === 0) return undefined
  return rollupParticipantStatus({ monthsClaimed: present.map((status) => ({ status })) })
}

// Finalization gate: every allowance-claiming participant is resolved, i.e. ALL its claimed months
// are terminal (Approve/Reject/Cancel) and no planned month is still unclaimed. Any month still
// Wait/Pending keeps the participant blocking.
// Non-claimers (isAllowance=false) never receive a workflow status, so they are excluded.
// No allowance claimers -> not finalizable (the claim-allowance track was never opened).
export function areAllowanceParticipantsResolved(
  participants: Array<{
    isAllowance: boolean
    status?: string
    months?: Array<{ month?: string | null }>
    monthsClaimed?: Array<{ month?: string | null; status?: string | null }>
  }>
): boolean {
  const claimers = participants.filter((p) => p.isAllowance)
  if (claimers.length === 0) return false
  return claimers.every((p) => isResolved(rollupParticipantStatus(p)))
}

// Actual claimed-allowance total at finalization: sum each APPROVE month across participants. Per
// month now, so a participant with May=Reject + June=Approve contributes only June. Rejected/cancelled
// months contribute nothing (their claim is void). Legacy months without a per-month status fall back
// to the participant rollup (an old fully-approved participant still counts all its months). A full
// recompute from current state, so re-running the gate overwrites cleanly without double counting.
export function sumClaimedAllowance(
  participants: Array<{
    status?: string
    monthsClaimed?: Array<{ status?: string | null; allowanceClaimed?: number | null }>
  }>
): number {
  let total = 0
  for (const p of participants) {
    const participantApproved = rollupParticipantStatus(p) === PARTICIPANT_STATUS.APPROVE
    for (const month of p.monthsClaimed ?? []) {
      const approved = month.status ? month.status === PARTICIPANT_STATUS.APPROVE : participantApproved
      if (approved) total += month.allowanceClaimed ?? 0
    }
  }
  return total
}
