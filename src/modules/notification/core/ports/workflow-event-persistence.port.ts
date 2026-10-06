import { type ClientSession } from "mongoose"

import { type WorkflowEventPayload } from "../types.js"

export interface WorkflowEventPersistenceOptions {
  session?: ClientSession | null
}

export interface WorkflowEventPersistence {
  createAuditLog(event: WorkflowEventPayload, options?: WorkflowEventPersistenceOptions): Promise<void>
  createWorkflowEventOutbox(
    event: WorkflowEventPayload,
    options?: WorkflowEventPersistenceOptions
  ): Promise<{ _id: { toString(): string } }>
}
