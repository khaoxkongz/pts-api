export type WorkflowEventType =
  | "PLANNER_CREATED"
  | "GA_ESTIMATE_CONFIRMED"
  | "GM_JV_REJECTED"
  | "GM_JV_APPROVED"
  | "GM_JV_REAPPROVAL_REQUIRED"
  | "PLANNER_FULLY_APPROVED"
  | "EMPLOYEE_SUMMARY_SUBMITTED"
  | "GA_ACTUAL_CONFIRMED"
  | "ALLOWANCE_CLAIM_CANCELLED"
  | "ALLOWANCE_CLAIM_REJECTED"
  | "PLANNER_READY_FOR_ANALYSIS"
  | "PLANNER_ANALYSIS_COMPLETED"
  | "PLANNER_CANCELLED"

export type RecipientKind = "GA" | "EMPLOYEE" | "SUPERVISOR" | "GM_APPROVER" | "PLANNER" | "FINANCE"

export interface WorkflowEventMetadata {
  documentId: string
  plannerName: string
  creatorAccountId?: string
  creatorEmployeeIds?: string[]
  gmApproverAccountIds?: string[]
  rejectionReason?: string
  jvTaxId?: string
  targetStatusBefore?: string
  targetStatusAfter?: string
  ratioBefore?: {
    percentage: number
    expense: number
  }
  ratioAfter?: {
    percentage: number
    expense: number
  }
  resetJvTaxIds?: string[]
  resetApproverAccountIds?: string[]
  participantAccountIds?: string[]
  participantEmployeeIds?: string[]
  affectedParticipantAccountId?: string
  affectedParticipantEmployeeId?: string
  transactionId?: string
  pendingConfirmExpireAt?: string
  actualBudgetItemCount?: number
  outcomeHasFile?: boolean
  triggerAction?: "EMP_SUMMARY_DONE" | "GA_ACTUAL_DONE" | "ALLOWANCE_RESOLVED"
  cancellationReason?: string
  notifyGa?: boolean
  notifyGm?: boolean
  worthinessValue?: string
  worthinessReason?: string
  worthinessHasFile?: boolean
}

export interface WorkflowEventPayload {
  eventId: string
  eventType: WorkflowEventType
  actorAccountId: string
  sourceType: "PLANNER"
  sourceId: string
  sourceName: string
  targetType: "PLANNER" | "JV"
  targetId: string
  fromStatuses: string[]
  toStatuses: string[]
  metadata: WorkflowEventMetadata
}
