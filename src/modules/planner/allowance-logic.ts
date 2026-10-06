import type { IUpdatePlannerDTO } from "./type.js"

type AllowanceParticipant = {
  isAllowance: boolean
  months?: { allowanceClaimed: number }[]
}

export function calculatePlannedAllowance(participants: AllowanceParticipant[]): number {
  return participants.reduce(
    (total, participant) =>
      total +
      (participant.isAllowance
        ? (participant.months ?? []).reduce((sum, month) => sum + month.allowanceClaimed, 0)
        : 0),
    0
  )
}

export function buildPlannerUpdate(data: IUpdatePlannerDTO): IUpdatePlannerDTO & { allowance?: number } {
  return {
    ...data,
    ...(data.participants !== undefined ? { allowance: calculatePlannedAllowance(data.participants) } : {}),
  }
}
