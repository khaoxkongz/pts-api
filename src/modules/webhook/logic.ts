import { DateTime } from "luxon"

const TIME_ZONE = "Asia/Bangkok"

// Participant approval status set from the Digital Workflow webhook.
// Mirrors the inline enum on participantSchema in @/models/planner.ts.
export const PARTICIPANT_STATUS = {
  APPROVE: "APPROVE", // เบี้ยเลี้ยงอนุมัติ — terminal
  REJECT: "REJECT", // เบี้ยเลี้ยงถูกปฏิเสธ — terminal, only via confirm (sweep/API)
  CANCEL: "CANCEL", // เบี้ยเลี้ยงถูกยกเลิก — terminal, only via confirm (sweep/API)
  WAIT: "WAIT", // กำลังดำเนินการเบี้ยเลี้ยง — reached via document_status "W"
  PENDING: "PENDING", // รอดำเนินการเบี้ยเลี้ยง — initial, set up front before any webhook
  PENDING_REJECT: "PENDING_REJECT", // รอยืนยันการปฏิเสธ — transient, re-claimable (5-day window)
  PENDING_CANCEL: "PENDING_CANCEL", // รอยืนยันการยกเลิก — transient, re-claimable (5-day window)
} as const

export type ParticipantStatus = (typeof PARTICIPANT_STATUS)[keyof typeof PARTICIPANT_STATUS]

// document_status code (from the webhook payload) -> participant status.
// "R"/"C" land in the transient PENDING_* states; bare REJECT/CANCEL are set only by confirm.
const DOCUMENT_STATUS_MAP: Record<string, ParticipantStatus> = {
  Y: PARTICIPANT_STATUS.APPROVE,
  R: PARTICIPANT_STATUS.PENDING_REJECT,
  C: PARTICIPANT_STATUS.PENDING_CANCEL,
  W: PARTICIPANT_STATUS.WAIT,
}

export function mapDocumentStatus(documentStatus: unknown): ParticipantStatus | null {
  if (typeof documentStatus !== "string") return null
  return DOCUMENT_STATUS_MAP[documentStatus] ?? null
}

// One entry of the webhook's json_data array.
export interface JsonDataEntry {
  text?: string
  key?: string
  value?: unknown
  type?: string
}

// Build a key -> value lookup from json_data (last entry wins on duplicate keys).
export function toJsonDataMap(jsonData: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>()
  if (!Array.isArray(jsonData)) return map
  for (const entry of jsonData) {
    if (entry && typeof entry === "object" && typeof (entry as JsonDataEntry).key === "string") {
      map.set((entry as JsonDataEntry).key as string, (entry as JsonDataEntry).value)
    }
  }
  return map
}

const PLANNER_DOC_NO_PATTERN = /^plannerDocNo\d+$/

// Collect unique, non-empty plannerDocNo{N} values from the json_data map.
// One document number = one plan, so duplicate values collapse to a single entry.
export function extractPlannerDocNos(map: Map<string, unknown>): string[] {
  const docNos: string[] = []
  for (const [key, value] of map) {
    if (!PLANNER_DOC_NO_PATTERN.test(key)) continue
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed === "") continue
    if (!docNos.includes(trimmed)) docNos.push(trimmed)
  }
  return docNos
}

// Read Employee_ID as a non-empty string (coercing a numeric id), or null.
export function extractEmployeeId(map: Map<string, unknown>): string | null {
  const raw = map.get("Employee_ID")
  if (typeof raw === "number") return String(raw)
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed === "" ? null : trimmed
}

// A single PLANNED month bucket of a participant's allowance (matches allowanceMonthSchema).
// Unique per month; carries no transaction identity.
export interface IAllowanceMonth {
  month: string
  allowanceMonthly: number
  allowanceDaily: number
  allowanceDays: number
  allowanceClaimed: number
  allowanceAccum: number
  allowanceRemaining: number
  // Per-entry status (status of the last webhook round that covered it). Empty on planned months.
  status: string
  // Per-entry confirm deadline (set only while status is PENDING_REJECT/PENDING_CANCEL).
  pendingConfirmAt?: Date | null
  pendingConfirmExpireAt?: Date | null
}

// A single CLAIMED entry (matches claimedMonthSchema). Unique per (month, transaction_id): the same
// month can hold several entries, one per source transaction, none overwriting another.
export interface IClaimedMonth extends IAllowanceMonth {
  transaction_id: string
}

export interface IAllowanceClaims {
  // One entry per distinct month, allowanceClaimed = summed Amount{N}.
  // allowanceDays = summed inclusive trip length (allowance_arrival{N} - allowance_departure{N} + 1)
  // for the same N's (null if none present/computable).
  months: Array<{ month: string; allowanceClaimed: number; allowanceDays: number | null }>
  // True if any Amount{N} carries a non-empty value (drives isAllowance).
  hasAnyAmount: boolean
  // Count of Amount{N} dropped because allowance_arrival{N} was missing/invalid.
  invalidArrivalCount: number
}

const AMOUNT_PATTERN = /^Amount(\d+)$/

function isNonEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim() !== ""
  return true
}

function toClaimAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    if (cleaned === "") return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// Inclusive trip length in whole days: allowance_departure{N} (trip start) to allowance_arrival{N}
// (trip end), counting BOTH endpoints — a same-day trip is 1 day. Returns null when either date is
// missing/invalid or arrival precedes departure, so the merge falls back to the planned days.
function toTripDays(departureValue: unknown, arrivalValue: unknown): number | null {
  if (typeof departureValue !== "string" || typeof arrivalValue !== "string") return null
  const departure = DateTime.fromISO(departureValue.trim(), { zone: TIME_ZONE }).startOf("day")
  const arrival = DateTime.fromISO(arrivalValue.trim(), { zone: TIME_ZONE }).startOf("day")
  if (!departure.isValid || !arrival.isValid) return null
  const days = Math.trunc(arrival.diff(departure, "days").days) + 1
  return days >= 1 ? days : null
}

// "YYYY-MM" of an allowance_arrival{N} value (day-of-month ignored), or null if invalid.
function toMonthBucket(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  const date = DateTime.fromISO(trimmed, { zone: TIME_ZONE })
  if (!date.isValid) return null
  return date.toFormat("yyyy-MM")
}

// Per-plan accumulator while scanning the rows of one webhook payload.
interface PlannerClaimAccumulator {
  byMonth: Map<string, number>
  daysByMonth: Map<string, number>
  hasAnyAmount: boolean
  invalidArrivalCount: number
}

// Read plannerDocNo{index} as a non-empty document id, or null.
function toPlannerDocNo(map: Map<string, unknown>, index: string): string | null {
  const value = map.get(`plannerDocNo${index}`)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

// Scan Amount{N} (non-empty) and group each row under the plan named by plannerDocNo{N} — the SAME
// row index. One webhook can carry rows for several plans, so a row's amount belongs ONLY to its own
// row's plan; grouping globally would copy every claimed month onto every referenced plan. Within a
// plan, rows are bucketed by the YYYY-MM of allowance_arrival{N} and amounts falling in the same
// month are summed. Trip days come from the allowance_departure{N}/allowance_arrival{N} pair
// (inclusive) and are summed per month alongside the amounts. A row whose plannerDocNo{N} is
// missing/empty names no plan and is dropped.
export function extractAllowanceClaimsByPlanner(map: Map<string, unknown>): Map<string, IAllowanceClaims> {
  const accumulators = new Map<string, PlannerClaimAccumulator>()

  for (const [key, value] of map) {
    const matched = AMOUNT_PATTERN.exec(key)
    if (!matched) continue
    if (!isNonEmptyValue(value)) continue

    const index = matched[1]
    if (index === undefined) continue

    const documentId = toPlannerDocNo(map, index)
    if (documentId === null) continue

    let accumulator = accumulators.get(documentId)
    if (!accumulator) {
      accumulator = { byMonth: new Map(), daysByMonth: new Map(), hasAnyAmount: false, invalidArrivalCount: 0 }
      accumulators.set(documentId, accumulator)
    }
    accumulator.hasAnyAmount = true

    const amount = toClaimAmount(value)
    if (amount === null) continue

    const month = toMonthBucket(map.get(`allowance_arrival${index}`))
    if (month === null) {
      accumulator.invalidArrivalCount += 1
      continue
    }

    accumulator.byMonth.set(month, (accumulator.byMonth.get(month) ?? 0) + amount)

    // Same N as the Amount/allowance_arrival above. The month is bucketed on the arrival (trip end);
    // a cross-month trip's whole inclusive span is attributed to that arrival month. Missing/invalid
    // dates yield null and contribute nothing, leaving the merge to fall back to the planned days.
    const days = toTripDays(map.get(`allowance_departure${index}`), map.get(`allowance_arrival${index}`))
    if (days !== null) accumulator.daysByMonth.set(month, (accumulator.daysByMonth.get(month) ?? 0) + days)
  }

  const claimsByPlanner = new Map<string, IAllowanceClaims>()
  for (const [documentId, accumulator] of accumulators) {
    claimsByPlanner.set(documentId, {
      months: [...accumulator.byMonth.entries()].map(([month, allowanceClaimed]) => ({
        month,
        allowanceClaimed,
        allowanceDays: accumulator.daysByMonth.get(month) ?? null,
      })),
      hasAnyAmount: accumulator.hasAnyAmount,
      invalidArrivalCount: accumulator.invalidArrivalCount,
    })
  }
  return claimsByPlanner
}

// Terminal statuses: never overwritten/resurrected by a later webhook round for the SAME entry.
// APPROVE is terminal too — including it stops a late/redelivered "W" from dragging an approved
// entry back to WAIT. (Item 6 — the sole line of that fix; see report.)
const TERMINAL_PROTECTED: string[] = [PARTICIPANT_STATUS.APPROVE, PARTICIPANT_STATUS.REJECT, PARTICIPANT_STATUS.CANCEL]

// A transient pending status, mapped to the terminal it confirms to when a re-claim replaces it.
// Mirrors PENDING_CONFIRM_TRANSITIONS in participant/logic.ts, which cannot be imported here (that
// module already imports this one).
const REPLACED_PENDING_TERMINAL: Partial<Record<string, ParticipantStatus>> = {
  [PARTICIPANT_STATUS.PENDING_REJECT]: PARTICIPANT_STATUS.REJECT,
  [PARTICIPANT_STATUS.PENDING_CANCEL]: PARTICIPANT_STATUS.CANCEL,
}

// Composite key: one claimed entry per (month, transaction_id). Null byte can't appear in a
// "YYYY-MM" month or a real transaction id, so it is a safe delimiter.
function claimedKey(month: string, transactionId: string): string {
  return `${month} ${transactionId}`
}

// Per-(month, transaction_id) UPSERT of a webhook round into a participant's monthsClaimed (the
// ACTUAL claimed track, separate from the planned `months`). All claims in a round share ONE
// transactionId. For each month in THIS round: overwrite the entry keyed by (month, transactionId)
// — claimed amount and work days from the round, the rest copied from the matching planned `months`
// entry — and set its status to this round's status. Entries with a DIFFERENT transaction_id, and
// months not in this round, are left untouched. That is what lets a cancelled entry from
// transaction A coexist with an active entry from transaction B in the same month, and lets an
// earlier-rejected month keep its status while a re-claim updates only the re-claimed entry.
// Within-round summing of duplicate Amount{N} already happened in extractAllowanceClaims, so each
// claim is the round total for its month and REPLACES (does not add to) that transaction's prior
// value. An entry already terminal (APPROVE/REJECT/CANCEL) is skipped — evaluated PER ENTRY, so a
// terminal entry for transaction A never blocks an incoming update for transaction B. One
// exception to "other transactions are left untouched": a W round re-claims its months, so any
// OTHER transaction's still-pending entry for a re-claimed month is confirmed terminal on the spot
// (see REPLACED_PENDING_TERMINAL) rather than left to the 5-day sweep.
export function mergeClaimsIntoMonthsClaimed(
  existingClaimed: IClaimedMonth[],
  plannedMonths: IAllowanceMonth[],
  claims: Array<{ month: string; allowanceClaimed: number; allowanceDays: number | null }>,
  roundStatus: ParticipantStatus,
  timer: { at: Date; expireAt: Date } | null,
  transactionId: string
): IClaimedMonth[] {
  const byKey = new Map<string, IClaimedMonth>(
    // Legacy entries predate transaction_id; treat a missing id as "" so keys stay stable.
    existingClaimed.map((entry) => [claimedKey(entry.month, entry.transaction_id ?? ""), { ...entry }])
  )
  const plannedByMonth = new Map<string, IAllowanceMonth>(plannedMonths.map((month) => [month.month, month]))

  for (const claim of claims) {
    if (roundStatus === PARTICIPANT_STATUS.WAIT) {
      for (const entry of byKey.values()) {
        if (entry.month !== claim.month) continue
        if ((entry.transaction_id ?? "") === transactionId) continue
        const confirmed = REPLACED_PENDING_TERMINAL[entry.status]
        if (!confirmed) continue
        entry.status = confirmed
        entry.pendingConfirmAt = null
        entry.pendingConfirmExpireAt = null
      }
    }

    const key = claimedKey(claim.month, transactionId)
    const existing = byKey.get(key)
    if (existing && TERMINAL_PROTECTED.includes(existing.status)) continue

    const planned = plannedByMonth.get(claim.month)
    byKey.set(key, {
      month: claim.month,
      allowanceMonthly: planned?.allowanceMonthly ?? existing?.allowanceMonthly ?? 0,
      allowanceDaily: planned?.allowanceDaily ?? existing?.allowanceDaily ?? 0,
      allowanceDays: claim.allowanceDays ?? planned?.allowanceDays ?? existing?.allowanceDays ?? 0,
      allowanceClaimed: claim.allowanceClaimed,
      allowanceAccum: planned?.allowanceAccum ?? existing?.allowanceAccum ?? 0,
      allowanceRemaining: planned?.allowanceRemaining ?? existing?.allowanceRemaining ?? 0,
      status: roundStatus,
      pendingConfirmAt: timer?.at ?? null,
      pendingConfirmExpireAt: timer?.expireAt ?? null,
      transaction_id: transactionId,
    })
  }

  return [...byKey.values()]
}
