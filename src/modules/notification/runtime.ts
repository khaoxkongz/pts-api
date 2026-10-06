import { MongoNotificationDeliveryRepository } from "./mongo-notification-delivery.js"
import { MongoRecipientResolverRepository } from "./mongo-recipient-resolver.js"
import { publishOutboxEventCommand } from "./publish-outbox-event.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()

const publishOutboxEvent = publishOutboxEventCommand({
  delivery: MongoNotificationDeliveryRepository,
  recipients: MongoRecipientResolverRepository,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(publishOutboxEvent)
