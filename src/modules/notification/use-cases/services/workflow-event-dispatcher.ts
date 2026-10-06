import { type ClientSession } from "mongoose"
import { v7 } from "uuid"

import { AuditLog } from "@/models/audit-log.js"
import { type TPlanner } from "@/models/planner.js"
import { WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import { type WorkflowEventPayload } from "../../core/types.js"

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

export interface WorkflowEventOutboxPublisher {
  publishOutboxById(outboxId: string): Promise<void>
}

export class WorkflowEventDispatcher {
  constructor(private readonly outboxPublisher: WorkflowEventOutboxPublisher) {}

  private static getPlannerGmApproverAccountIds(planner: TPlanner) {
    return [
      ...new Set(
        planner.jvs.flatMap((jv) => jv.approversList?.map((approver) => approver.accountId) ?? []).filter(Boolean)
      ),
    ]
  }

  private static getPlannerJv(planner: TPlanner, jvTaxId: string) {
    return planner.jvs.find((jv) => jv.taxId === jvTaxId)
  }

  private static getParticipantAccountIds(planner: TPlanner) {
    return [...new Set((planner.participants ?? []).map((p) => p.accountId).filter(Boolean))]
  }

  private static getParticipantEmployeeIds(planner: TPlanner) {
    return [...new Set((planner.participants ?? []).flatMap((p) => p.employeeId ?? []).filter(Boolean))]
  }

  public static mapToPayload(event: WorkflowEvent): WorkflowEventPayload {
    switch (event.type) {
      case "PLANNER_CREATED": {
        const { planner } = event.payload
        return {
          eventId: v7(),
          eventType: "PLANNER_CREATED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: planner.documentId,
          sourceName: planner.name,
          targetType: "PLANNER",
          targetId: planner.documentId,
          fromStatuses: [],
          toStatuses: planner.status.map(String),
          metadata: {
            documentId: planner.documentId,
            plannerName: planner.name,
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(planner),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(planner),
          },
        }
      }
      case "GM_JV_REJECTED": {
        const { plannerBefore, plannerAfter } = event.payload
        const jvBefore = WorkflowEventDispatcher.getPlannerJv(plannerBefore, event.meta.jvTaxId)
        const jvAfter = WorkflowEventDispatcher.getPlannerJv(plannerAfter, event.meta.jvTaxId)

        return {
          eventId: v7(),
          eventType: "GM_JV_REJECTED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "JV",
          targetId: event.meta.jvTaxId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            creatorAccountId: plannerAfter.createdBy,
            creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
            gmApproverAccountIds: WorkflowEventDispatcher.getPlannerGmApproverAccountIds(plannerAfter).filter(
              (accountId) => accountId !== event.meta.actorAccountId
            ),
            rejectionReason: event.meta.rejectionReason,
            jvTaxId: event.meta.jvTaxId,
            targetStatusBefore: jvBefore?.status ? String(jvBefore.status) : "",
            targetStatusAfter: jvAfter?.status ? String(jvAfter.status) : "",
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "GM_JV_APPROVED": {
        const { plannerBefore, plannerAfter } = event.payload
        const jvBefore = WorkflowEventDispatcher.getPlannerJv(plannerBefore, event.meta.jvTaxId)
        const jvAfter = WorkflowEventDispatcher.getPlannerJv(plannerAfter, event.meta.jvTaxId)

        return {
          eventId: v7(),
          eventType: "GM_JV_APPROVED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "JV",
          targetId: event.meta.jvTaxId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
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
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "GM_JV_REAPPROVAL_REQUIRED": {
        const { plannerBefore, plannerAfter } = event.payload
        const resetApproverAccountIds = [
          ...new Set(
            plannerAfter.jvs
              .filter((jv) => event.meta.resetJvTaxIds.includes(jv.taxId))
              .flatMap((jv) => jv.approversList?.map((approver) => approver.accountId) ?? [])
              .filter(Boolean)
          ),
        ]

        return {
          eventId: v7(),
          eventType: "GM_JV_REAPPROVAL_REQUIRED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            jvTaxId: event.meta.triggeringJvTaxId,
            resetJvTaxIds: event.meta.resetJvTaxIds,
            resetApproverAccountIds,
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "PLANNER_FULLY_APPROVED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "PLANNER_FULLY_APPROVED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            creatorAccountId: plannerAfter.createdBy,
            creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "GA_ESTIMATE_CONFIRMED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "GA_ESTIMATE_CONFIRMED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
            gmApproverAccountIds: WorkflowEventDispatcher.getPlannerGmApproverAccountIds(plannerAfter),
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "GA_ACTUAL_CONFIRMED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "GA_ACTUAL_CONFIRMED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            actualBudgetItemCount: plannerAfter.actualBudget.length,
            triggerAction: "GA_ACTUAL_DONE",
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "PLANNER_ANALYSIS_COMPLETED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "PLANNER_ANALYSIS_COMPLETED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            gmApproverAccountIds: WorkflowEventDispatcher.getPlannerGmApproverAccountIds(plannerAfter),
            worthinessValue: plannerAfter.worthiness?.worthiness ?? "",
            worthinessReason: plannerAfter.worthiness?.reason ?? "",
            worthinessHasFile: (plannerAfter.worthiness?.files?.length ?? 0) > 0,
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "ALLOWANCE_CLAIM_CANCELLED":
      case "ALLOWANCE_CLAIM_REJECTED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: event.type,
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: event.meta.transactionId || event.meta.affectedParticipantAccountId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            affectedParticipantAccountId: event.meta.affectedParticipantAccountId,
            affectedParticipantEmployeeId: event.meta.affectedParticipantEmployeeId,
            transactionId: event.meta.transactionId,
            pendingConfirmExpireAt: event.meta.pendingConfirmExpireAt.toISOString(),
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "EMPLOYEE_SUMMARY_SUBMITTED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "EMPLOYEE_SUMMARY_SUBMITTED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            actualBudgetItemCount: plannerAfter.actualBudget.length,
            outcomeHasFile: (plannerAfter.outcome?.supportingDocuments?.length ?? 0) > 0,
            triggerAction: "EMP_SUMMARY_DONE",
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "PLANNER_READY_FOR_ANALYSIS": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "PLANNER_READY_FOR_ANALYSIS",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
            gmApproverAccountIds: WorkflowEventDispatcher.getPlannerGmApproverAccountIds(plannerAfter),
            triggerAction: event.meta.triggerAction,
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
          },
        }
      }
      case "PLANNER_CANCELLED": {
        const { plannerBefore, plannerAfter } = event.payload
        return {
          eventId: v7(),
          eventType: "PLANNER_CANCELLED",
          actorAccountId: event.meta.actorAccountId,
          sourceType: "PLANNER",
          sourceId: plannerAfter.documentId,
          sourceName: plannerAfter.name,
          targetType: "PLANNER",
          targetId: plannerAfter.documentId,
          fromStatuses: plannerBefore.status.map(String),
          toStatuses: plannerAfter.status.map(String),
          metadata: {
            documentId: plannerAfter.documentId,
            plannerName: plannerAfter.name,
            creatorAccountId: plannerAfter.createdBy,
            creatorEmployeeIds: plannerAfter.createdByEmployeeId.map(String),
            gmApproverAccountIds: WorkflowEventDispatcher.getPlannerGmApproverAccountIds(plannerAfter),
            participantAccountIds: WorkflowEventDispatcher.getParticipantAccountIds(plannerAfter),
            participantEmployeeIds: WorkflowEventDispatcher.getParticipantEmployeeIds(plannerAfter),
            cancellationReason: event.meta.reason,
            notifyGa: event.meta.notifyGa,
            notifyGm: event.meta.notifyGm,
          },
        }
      }
      default: {
        return event satisfies never
      }
    }
  }

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
        await this.outboxPublisher.publishOutboxById(outbox._id.toString())
      } catch (error) {
        console.error("Failed to publish workflow event outbox", error)
      }
    })
  }

  public async dispatch(event: WorkflowEvent, context?: WorkflowEventDispatchContext) {
    const payload = WorkflowEventDispatcher.mapToPayload(event)
    await this.persistWorkflowEvent(payload, context)
  }
}
