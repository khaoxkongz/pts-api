import { type RecipientKind, type WorkflowEventPayload, type WorkflowEventType } from "../types.js"

export type RecipientTarget =
  | "ROLE:GA"
  | "ROLE:PLANNER"
  | "ROLE:FINANCE"
  | "SUPERVISOR"
  | "CREATOR"
  | "PLANNER_MEMBERS"
  | "GM_APPROVERS"
  | "RESET_APPROVERS"
  | "AFFECTED_EMPLOYEE"
  | "CANCELLATION_AUDIENCE"

export interface StatusGuard {
  fromStatusesAllOf?: string[]
  fromStatusesNoneOf?: string[]
  toStatusesAllOf?: string[]
  toStatusesNoneOf?: string[]
}

export interface ContentVariantWhen {
  recipientKinds?: RecipientKind[]
  metadata?: Partial<Record<keyof WorkflowEventPayload["metadata"], string | number | boolean>>
}

export interface NotificationContentVariant {
  when?: ContentVariantWhen
  templateKey: string
  title: string
  body: string
}

export interface NotificationRuleDefinition {
  mode: "notify"
  guards?: StatusGuard[]
  targets: RecipientTarget[]
  content: NotificationContentVariant[]
}

export interface AuditOnlyRuleDefinition {
  mode: "audit_only"
  reason: string
}

export type WorkflowEventRuleDefinition = NotificationRuleDefinition | AuditOnlyRuleDefinition

export interface NotificationRulesConfig {
  events: Record<WorkflowEventType, WorkflowEventRuleDefinition>
}

export interface ResolvedNotification {
  accountId: string
  recipientKind: RecipientKind
  eventType: WorkflowEventType
  templateKey: string
  title: string
  body: string
  sourceType: WorkflowEventPayload["sourceType"]
  sourceId: string
  sourceName: string
  data: {
    documentId: string
    jvTaxId?: string
    resetJvTaxIds?: string[]
    transactionId?: string
    pendingConfirmExpireAt?: string
    cancellationReason?: string
  }
}
