import { MongoNotificationDeliveryRepository } from "./adapters/persistence/mongo-notification-delivery.repository.js"
import { MongoRecipientResolverRepository } from "./adapters/persistence/mongo-recipient-resolver.repository.js"
import { SsePushHub } from "./adapters/push/sse-push-hub.adapter.js"
import { notificationRulesConfig } from "./core/rules/notification-rules.config.js"
import { NotificationRulesEngine } from "./core/rules/notification-rules.engine.js"
import { notificationModule } from "./module.js"
import { publishOutboxEventCommand } from "./use-cases/commands/publish-outbox-event.handler.js"
import { WorkflowEventDispatcher } from "./use-cases/services/workflow-event-dispatcher.js"

const pushHub = new SsePushHub()
const rulesEngine = new NotificationRulesEngine(MongoRecipientResolverRepository, notificationRulesConfig)

export const notification = notificationModule({ pushHub })

const publishOutboxEvent = publishOutboxEventCommand({
  notificationDelivery: MongoNotificationDeliveryRepository,
  rulesEngine,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher({
  publishOutboxById: (outboxId: string) => publishOutboxEvent(outboxId),
})
