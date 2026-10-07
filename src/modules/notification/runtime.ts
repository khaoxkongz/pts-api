import env from "@/env.js"

import { createAppPush } from "./app-push.js"
import { MongoNotificationStore } from "./mongo-notification-store.js"
import { createMongoOutboxEvents } from "./mongo-outbox-events.js"
import { MongoRecipientResolver } from "./mongo-recipient-resolver.js"
import { createOnePlatformClient } from "./one-platform.js"
import { createOutboxRelay } from "./outbox-relay.js"
import { createOutboxEventPublisher } from "./publish-outbox-event.js"
import { SsePushHub } from "./sse-push-hub.js"
import { WorkflowEventDispatcher } from "./workflow-event.js"

export const pushHub = new SsePushHub()

const outboxEvents = createMongoOutboxEvents({ leaseMs: env.OUTBOX_LEASE_MS })

// The single App Push. Without a OnePlatform token it is off: nothing is sent and nothing is marked pushed.
const onePlatform = env.ONE_PLATFORM_API_TOKEN
  ? createOnePlatformClient({
      baseUrl: env.ONE_PLATFORM_API_BASE_URL,
      token: env.ONE_PLATFORM_API_TOKEN,
      timeoutMs: env.ONE_PLATFORM_API_TIMEOUT_MS,
    })
  : null
if (!onePlatform) {
  console.log("[app-push] disabled: ONE_PLATFORM_API_TOKEN is not set")
}

export const appPush = createAppPush({
  onePlatform,
  store: MongoNotificationStore,
  miniAppId: env.ONE_PLATFORM_MINI_APP_ID,
})

const publishOutboxEvent = createOutboxEventPublisher({
  outbox: outboxEvents,
  notifications: MongoNotificationStore,
  recipients: MongoRecipientResolver,
  pushHub,
  appPush,
})

export const workflowEventDispatcher = new WorkflowEventDispatcher(publishOutboxEvent)

// The Relay publishes through the same publisher as the dispatcher's immediate publish, so both send App Push
// the same way. The retry policy is set here (the attempts cap on the Relay, the Lease on the outbox above);
// main.ts starts it with its interval.
export const outboxRelay = createOutboxRelay({
  outbox: outboxEvents,
  publish: publishOutboxEvent,
  maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
})
