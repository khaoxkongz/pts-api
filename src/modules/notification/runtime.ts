import env from "@/env.js"

import { MongoNotificationStore } from "./mongo-notification-store.js"
import { createMongoOutboxEvents } from "./mongo-outbox-events.js"
import { MongoRecipientResolver } from "./mongo-recipient-resolver.js"
import { createOutboxRelay } from "./outbox-relay.js"
import { createOutboxEventPublisher } from "./publish-outbox-event.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()

const outboxEvents = createMongoOutboxEvents({ leaseMs: env.OUTBOX_LEASE_MS })

const publishOutboxEvent = createOutboxEventPublisher({
  outbox: outboxEvents,
  notifications: MongoNotificationStore,
  recipients: MongoRecipientResolver,
  pushHub,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(publishOutboxEvent)

// The Relay publishes through the same publisher as the dispatcher's immediate publish. Its retry policy
// (the attempts cap and the Lease) is set here; main.ts starts it with its interval and stops it.
export const outboxRelay = createOutboxRelay({
  outbox: outboxEvents,
  publish: publishOutboxEvent,
  maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
})
