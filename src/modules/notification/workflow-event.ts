import { type ClientSession } from "mongoose"
import { v7 } from "uuid"

import { AuditLog } from "@/models/audit-log.js"
import { type TPlanner } from "@/models/planner.js"
import { WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import { type WorkflowEventMetadata, type WorkflowEventPayload } from "./type.js"

type WorkflowEventTriggerAction = "EMP_SUMMARY_DONE" | "GA_ACTUAL_DONE" | "ALLOWANCE_RESOLVED"

export type WorkflowEvent =
  | {
      type: "PLANNER_CREATED"
      payload: {
        planner: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "GM_JV_REJECTED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        jvTaxId: string
        rejectionReason: string
      }
    }
  | {
      type: "GM_JV_APPROVED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        jvTaxId: string
      }
    }
  | {
      type: "GM_JV_REAPPROVAL_REQUIRED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        triggeringJvTaxId: string
        resetJvTaxIds: string[]
      }
    }
  | {
      type: "PLANNER_FULLY_APPROVED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "GA_ESTIMATE_CONFIRMED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "GA_ACTUAL_CONFIRMED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "PLANNER_ANALYSIS_COMPLETED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "ALLOWANCE_CLAIM_CANCELLED" | "ALLOWANCE_CLAIM_REJECTED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        affectedParticipantAccountId: string
        affectedParticipantEmployeeId: string
        transactionId: string
        pendingConfirmExpireAt: Date
      }
    }
  | {
      type: "EMPLOYEE_SUMMARY_SUBMITTED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
      }
    }
  | {
      type: "PLANNER_CANCELLED"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        reason: string
        notifyGa: boolean
        notifyGm: boolean
      }
    }
  | {
      type: "PLANNER_READY_FOR_ANALYSIS"
      payload: {
        plannerBefore: TPlanner
        plannerAfter: TPlanner
      }
      meta: {
        actorAccountId: string
        triggerAction: WorkflowEventTriggerAction
      }
    }

export interface WorkflowEventDispatchContext {
  /** The caller's transaction; the audit log and Outbox Event are saved inside it when given. */
  session?: ClientSession | null
}

function getPlannerGmApproverAccountIds(planner: TPlanner) {
  return [
    ...new Set(
      planner.jvs.flatMap((jv) => jv.approversList?.map((approver) => approver.accountId) ?? []).filter(Boolean)
    ),
  ]
}

function getPlannerJv(planner: TPlanner, jvTaxId: string) {
  return planner.jvs.find((jv) => jv.taxId === jvTaxId)
}

function getParticipantAccountIds(planner: TPlanner) {
  return [...new Set((planner.participants ?? []).map((p) => p.accountId).filter(Boolean))]
}

function getParticipantEmployeeIds(planner: TPlanner) {
  return [...new Set((planner.participants ?? []).flatMap((p) => p.employeeId ?? []).filter(Boolean))]
}

/** Metadata that only some event types carry; the planner's identity and participants are added by `plannerEventPayload`. */
type EventSpecificMetadata = Omit<
  WorkflowEventMetadata,
  "documentId" | "plannerName" | "participantAccountIds" | "participantEmployeeIds"
>

interface EventSpecificFields {
  /** Defaults to the planner itself. */
  targetType?: WorkflowEventPayload["targetType"]
  /** Defaults to the planner's document id. */
  targetId?: string
  metadata?: EventSpecificMetadata
}

function plannersOf(event: WorkflowEvent): { plannerBefore: TPlanner | null; plannerAfter: TPlanner } {
  if (event.type === "PLANNER_CREATED") {
    return { plannerBefore: null, plannerAfter: event.payload.planner }
  }
  return event.payload
}

/**
 * Builds the envelope every Workflow Event shares: who acted, the planner it is about, its status change
 * and its participants. A planner that was just created has no statuses before the change.
 */
function plannerEventPayload(event: WorkflowEvent, fields: EventSpecificFields = {}): WorkflowEventPayload {
  const { plannerBefore, plannerAfter } = plannersOf(event)

  return {
    eventId: v7(),
    eventType: event.type,
    actorAccountId: event.meta.actorAccountId,
    sourceType: "PLANNER",
    sourceId: plannerAfter.documentId,
    sourceName: plannerAfter.name,
    targetType: fields.targetType ?? "PLANNER",
    targetId: fields.targetId ?? plannerAfter.documentId,
    fromStatuses: plannerBefore?.status.map(String) ?? [],
    toStatuses: plannerAfter.status.map(String),
    metadata: {
      documentId: plannerAfter.documentId,
      plannerName: plannerAfter.name,
      ...fields.metadata,
      participantAccountIds: getParticipantAccountIds(plannerAfter),
      participantEmployeeIds: getParticipantEmployeeIds(plannerAfter),
    },
  }
}

function mapToPayload(event: WorkflowEvent): WorkflowEventPayload {
  switch (event.type) {
    case "PLANNER_CREATED": {
      return plannerEventPayload(event)
    }
    case "GM_JV_REJECTED": {
      const { plannerBefore, plannerAfter } = event.payload
      const jvBefore = getPlannerJv(plannerBefore, event.meta.jvTaxId)
      const jvAfter = getPlannerJv(plannerAfter, event.meta.jvTaxId)

      return plannerEventPayload(event, {
        targetType: "JV",
        targetId: event.meta.jvTaxId,
        metadata: {
          creatorAccountId: plannerAfter.createdBy,
          creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
          gmApproverAccountIds: getPlannerGmApproverAccountIds(plannerAfter).filter(
            (accountId) => accountId !== event.meta.actorAccountId
          ),
          rejectionReason: event.meta.rejectionReason,
          jvTaxId: event.meta.jvTaxId,
          targetStatusBefore: jvBefore?.status ? String(jvBefore.status) : "",
          targetStatusAfter: jvAfter?.status ? String(jvAfter.status) : "",
        },
      })
    }
    case "GM_JV_APPROVED": {
      const { plannerBefore, plannerAfter } = event.payload
      const jvBefore = getPlannerJv(plannerBefore, event.meta.jvTaxId)
      const jvAfter = getPlannerJv(plannerAfter, event.meta.jvTaxId)

      return plannerEventPayload(event, {
        targetType: "JV",
        targetId: event.meta.jvTaxId,
        metadata: {
          jvTaxId: event.meta.jvTaxId,
          targetStatusBefore: jvBefore?.status ? String(jvBefore.status) : "",
          targetStatusAfter: jvAfter?.status ? String(jvAfter.status) : "",
          ratioBefore: {
            percentage: jvBefore?.percentageRatio ?? 0,
            expense: jvBefore?.expenseRatio ?? 0,
          },
          ratioAfter: {
            percentage: jvAfter?.percentageRatio ?? 0,
            expense: jvAfter?.expenseRatio ?? 0,
          },
        },
      })
    }
    case "GM_JV_REAPPROVAL_REQUIRED": {
      const { plannerAfter } = event.payload
      const resetApproverAccountIds = [
        ...new Set(
          plannerAfter.jvs
            .filter((jv) => event.meta.resetJvTaxIds.includes(jv.taxId))
            .flatMap((jv) => jv.approversList?.map((approver) => approver.accountId) ?? [])
            .filter(Boolean)
        ),
      ]

      return plannerEventPayload(event, {
        metadata: {
          jvTaxId: event.meta.triggeringJvTaxId,
          resetJvTaxIds: event.meta.resetJvTaxIds,
          resetApproverAccountIds,
        },
      })
    }
    case "PLANNER_FULLY_APPROVED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          creatorAccountId: plannerAfter.createdBy,
          creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
        },
      })
    }
    case "GA_ESTIMATE_CONFIRMED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
          gmApproverAccountIds: getPlannerGmApproverAccountIds(plannerAfter),
        },
      })
    }
    case "GA_ACTUAL_CONFIRMED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          actualBudgetItemCount: plannerAfter.actualBudget.length,
          triggerAction: "GA_ACTUAL_DONE",
        },
      })
    }
    case "PLANNER_ANALYSIS_COMPLETED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          gmApproverAccountIds: getPlannerGmApproverAccountIds(plannerAfter),
          worthinessValue: plannerAfter.worthiness?.worthiness ?? "",
          worthinessReason: plannerAfter.worthiness?.reason ?? "",
          worthinessHasFile: (plannerAfter.worthiness?.files?.length ?? 0) > 0,
        },
      })
    }
    case "ALLOWANCE_CLAIM_CANCELLED":
    case "ALLOWANCE_CLAIM_REJECTED": {
      return plannerEventPayload(event, {
        targetId: event.meta.transactionId || event.meta.affectedParticipantAccountId,
        metadata: {
          affectedParticipantAccountId: event.meta.affectedParticipantAccountId,
          affectedParticipantEmployeeId: event.meta.affectedParticipantEmployeeId,
          transactionId: event.meta.transactionId,
          pendingConfirmExpireAt: event.meta.pendingConfirmExpireAt.toISOString(),
        },
      })
    }
    case "EMPLOYEE_SUMMARY_SUBMITTED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          actualBudgetItemCount: plannerAfter.actualBudget.length,
          outcomeHasFile: (plannerAfter.outcome?.supportingDocuments?.length ?? 0) > 0,
          triggerAction: "EMP_SUMMARY_DONE",
        },
      })
    }
    case "PLANNER_READY_FOR_ANALYSIS": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
          gmApproverAccountIds: getPlannerGmApproverAccountIds(plannerAfter),
          triggerAction: event.meta.triggerAction,
        },
      })
    }
    case "PLANNER_CANCELLED": {
      const { plannerAfter } = event.payload
      return plannerEventPayload(event, {
        metadata: {
          creatorAccountId: plannerAfter.createdBy,
          creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
          gmApproverAccountIds: getPlannerGmApproverAccountIds(plannerAfter),
          cancellationReason: event.meta.reason,
          notifyGa: event.meta.notifyGa,
          notifyGm: event.meta.notifyGm,
        },
      })
    }
    default: {
      return event satisfies never
    }
  }
}

export class WorkflowEventDispatcher {
  constructor(private readonly publishOutboxEvent: (outboxId: string) => Promise<void>) {}

  private async persistWorkflowEvent(event: WorkflowEventPayload, context?: WorkflowEventDispatchContext) {
    const saveOptions = context?.session ? { session: context.session } : undefined

    await new AuditLog({
      eventId: event.eventId,
      eventType: event.eventType,
      actorAccountId: event.actorAccountId,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      sourceName: event.sourceName,
      targetType: event.targetType,
      targetId: event.targetId,
      fromStatuses: event.fromStatuses,
      toStatuses: event.toStatuses,
      metadata: event.metadata,
    }).save(saveOptions)

    const outbox = await new WorkflowEventOutbox({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event,
    }).save(saveOptions)

    queueMicrotask(async () => {
      try {
        await this.publishOutboxEvent(outbox._id.toString())
      } catch (error) {
        console.error("Failed to publish workflow event outbox", error)
      }
    })
  }

  public async dispatch(event: WorkflowEvent, context?: WorkflowEventDispatchContext) {
    const payload = mapToPayload(event)
    await this.persistWorkflowEvent(payload, context)
  }
}
