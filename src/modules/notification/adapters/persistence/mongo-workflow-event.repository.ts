import { AuditLog } from "@/models/audit-log.js"
import { WorkflowEventOutbox } from "@/models/workflow-event-outbox.js"

import {
  type WorkflowEventPersistence,
  type WorkflowEventPersistenceOptions,
} from "../../core/ports/workflow-event-persistence.port.js"
import { type WorkflowEventPayload } from "../../core/types.js"

export const MongoWorkflowEventRepository: WorkflowEventPersistence = {
  async createAuditLog(event: WorkflowEventPayload, options?: WorkflowEventPersistenceOptions) {
    const auditLog = new AuditLog({
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
    })

    if (options?.session) {
      await auditLog.save({ session: options.session })
      return
    }

    await auditLog.save()
  },

  async createWorkflowEventOutbox(event: WorkflowEventPayload, options?: WorkflowEventPersistenceOptions) {
    const outbox = new WorkflowEventOutbox({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event,
    })

    if (options?.session) {
      await outbox.save({ session: options.session })
      return { _id: outbox._id }
    }

    await outbox.save()
    return { _id: outbox._id }
  },
}
