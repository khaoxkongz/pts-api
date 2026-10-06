import env from "@/env.js"

import { HmacSessionTokenVerifier } from "./adapters/auth/session-token-verifier.js"
import { MongoNotificationDeliveryRepository } from "./adapters/persistence/mongo-notification-delivery.repository.js"
import { MongoNotificationReaderRepository } from "./adapters/persistence/mongo-notification-reader.repository.js"
import { MongoNotificationWriterRepository } from "./adapters/persistence/mongo-notification-writer.repository.js"
import { MongoRecipientResolverRepository } from "./adapters/persistence/mongo-recipient-resolver.repository.js"
import { MongoStreamAuthRepository } from "./adapters/persistence/mongo-stream-auth.repository.js"
import { MongoWorkflowEventRepository } from "./adapters/persistence/mongo-workflow-event.repository.js"
import { SsePushHub } from "./adapters/push/sse-push-hub.adapter.js"
import { notificationRulesConfig } from "./core/rules/notification-rules.config.js"
import { DefaultNotificationRulesEngine } from "./core/rules/notification-rules.engine.js"
import { notificationModule } from "./module.js"
import { publishOutboxEventCommand } from "./use-cases/commands/publish-outbox-event.handler.js"
import { WorkflowEventDispatcher } from "./use-cases/services/workflow-event-dispatcher.js"

const pushHub = new SsePushHub()
const rulesEngine = new DefaultNotificationRulesEngine(MongoRecipientResolverRepository, notificationRulesConfig)

export const notification = notificationModule({
  notificationReader: MongoNotificationReaderRepository,
  notificationWriter: MongoNotificationWriterRepository,
  streamAuth: MongoStreamAuthRepository,
  sessionTokenVerifier: new HmacSessionTokenVerifier(env.SESSION_SECRET),
  pushHub,
})

const publishOutboxEvent = publishOutboxEventCommand({
  notificationDelivery: MongoNotificationDeliveryRepository,
  rulesEngine,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(MongoWorkflowEventRepository, {
  publishOutboxById: (outboxId: string) => publishOutboxEvent(outboxId),
})

export type {
  IWorkflowEventDispatcher,
  WorkflowEvent,
  WorkflowEventDispatchContext,
} from "./use-cases/services/workflow-event-dispatcher.js"
