import { NotificationRulesEngine } from "./evaluate-rules.js"
import { MongoNotificationDeliveryRepository } from "./mongo-notification-delivery.js"
import { MongoRecipientResolverRepository } from "./mongo-recipient-resolver.js"
import { publishOutboxEventCommand } from "./publish-outbox-event.js"
import { notificationRulesConfig } from "./rules.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()
const rulesEngine = new NotificationRulesEngine(MongoRecipientResolverRepository, notificationRulesConfig)

const publishOutboxEvent = publishOutboxEventCommand({
  notificationDelivery: MongoNotificationDeliveryRepository,
  rulesEngine,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher({
  publishOutboxById: (outboxId: string) => publishOutboxEvent(outboxId),
})
