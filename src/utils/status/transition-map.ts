import { STATUS, type PlannerAction, type PlannerStatus } from "./status.js"

type TransitionValue = PlannerStatus[] | ((allStatuses: PlannerStatus[]) => PlannerStatus[])

export const TransitionMap: Record<PlannerStatus, Partial<Record<PlannerAction, TransitionValue>>> = {
  [STATUS.DRAFT]: {
    SUBMIT: [STATUS.WAITING_GA_ESTIMATE],
  },

  [STATUS.WAITING_GA_ESTIMATE]: {
    GA_ESTIMATE_DONE: [STATUS.WAITING_JV_APPROVAL],
  },

  [STATUS.WAITING_JV_APPROVAL]: {
    APPROVE_ONE_JV: [STATUS.JV_APPROVED],
    JV_APPROVE: [STATUS.WAITING_EMP_SUMMARY, STATUS.WAITING_GA_ACTUAL_COST, STATUS.WAITING_CLAIM_ALLOWANCE],
    JV_REJECT: [STATUS.JV_REJECTED],
  },

  [STATUS.WAITING_EMP_SUMMARY]: {
    EMP_SUMMARY_DONE: (allStatuses) => {
      const remaining = allStatuses.filter((s) => s !== STATUS.WAITING_EMP_SUMMARY)
      if (remaining.length === 0) {
        return [STATUS.GA_COMPLETED, STATUS.WAITING_PLANNER_COST_ANALYSIS]
      }
      return []
    },
  },

  [STATUS.WAITING_GA_ACTUAL_COST]: {
    GA_ACTUAL_DONE: (allStatuses) => {
      const remaining = allStatuses.filter((s) => s !== STATUS.WAITING_GA_ACTUAL_COST)
      if (remaining.length === 0) {
        return [STATUS.GA_COMPLETED, STATUS.WAITING_PLANNER_COST_ANALYSIS]
      }
      return []
    },
  },

  [STATUS.WAITING_CLAIM_ALLOWANCE]: {
    CLAIM_ALLOWANCE: (allStatuses) => {
      const remaining = allStatuses.filter((s) => s !== STATUS.WAITING_CLAIM_ALLOWANCE)
      if (remaining.length === 0) {
        return [STATUS.GA_COMPLETED, STATUS.WAITING_PLANNER_COST_ANALYSIS]
      }
      return []
    },
  },

  [STATUS.WAITING_PLANNER_COST_ANALYSIS]: {
    PLANNER_ANALYSIS_DONE: [STATUS.GA_COMPLETED, STATUS.COMPLETED],
  },

  // final state
  [STATUS.JV_APPROVED]: {},
  [STATUS.JV_REJECTED]: {},
  [STATUS.GA_COMPLETED]: {},
  [STATUS.COMPLETED]: {},
  [STATUS.WAITING]: {},
  [STATUS.CANCELLED]: {},
}
