import { MongoNotificationDelivery } from "./mongo-notification-delivery.js"
import { MongoRecipientResolver } from "./mongo-recipient-resolver.js"
import { createOutboxEventPublisher } from "./publish-outbox-event.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()

const publishOutboxEvent = createOutboxEventPublisher({
  delivery: MongoNotificationDelivery,
  recipients: MongoRecipientResolver,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(publishOutboxEvent)
