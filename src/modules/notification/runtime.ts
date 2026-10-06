import { MongoNotificationStore } from "./mongo-notification-store.js"
import { MongoOutboxEvents } from "./mongo-outbox-events.js"
import { MongoRecipientResolver } from "./mongo-recipient-resolver.js"
import { createOutboxEventPublisher } from "./publish-outbox-event.js"
import { type RelayDueOutboxEventsDeps } from "./relay-due-outbox-events.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()

const publishOutboxEvent = createOutboxEventPublisher({
  outbox: MongoOutboxEvents,
  notifications: MongoNotificationStore,
  recipients: MongoRecipientResolver,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(publishOutboxEvent)

// The relay publishes through the same publisher as the dispatcher's immediate publish.
export const outboxRelayDeps: Pick<RelayDueOutboxEventsDeps, "outbox" | "publish"> = {
  outbox: MongoOutboxEvents,
  publish: publishOutboxEvent,
}
