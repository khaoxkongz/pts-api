import { PLANNER_ACTIONS, STATUS, type PlannerAction, type PlannerStatus } from "./status.js"
import { TransitionMap } from "./transition-map.js"

export function moveStatusForward(
  statuses: PlannerStatus[],
  action: PlannerAction,
  currentActionStatus: PlannerStatus
): PlannerStatus[] {
  if (action === PLANNER_ACTIONS.CANCEL) {
    return [STATUS.CANCELLED]
  }

  // currentActionStatus is the status this action consumes, named by the caller rather than read from
  // the planner. When the planner is not actually in it — a stale page re-submitting an action that
  // already ran — there is nothing to move forward, and falling through would append the transition
  // target on top of the statuses that have since advanced.
  if (!statuses.includes(currentActionStatus)) {
    return statuses
  }

  const transition = TransitionMap[currentActionStatus]?.[action]
  if (!transition) {
    return statuses
  }

  let updated = [...statuses]

  let next: PlannerStatus[]
  if (typeof transition === "function") {
    next = transition(statuses)
  } else {
    next = transition
  }

  updated = updated.filter((s) => s !== currentActionStatus)

  const resultSet = new Set([...updated, ...next])

  if (next.includes(STATUS.WAITING_PLANNER_COST_ANALYSIS)) {
    return [STATUS.GA_COMPLETED, STATUS.WAITING_PLANNER_COST_ANALYSIS]
  }

  return [...resultSet]
}
