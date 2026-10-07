# App Push is best effort and at most once, outside the Outbox's retries

Notifications now also reach the recipient's OnePlatform app: an App Push (`POST push-notify-to-app`) for each new notification, and the App Badge (`PUT set-badge`) after the account reads notifications. Publishing an Outbox Event is retried until it succeeds, and a retry re-delivers notifications that already existed, which Live Push allows but a phone notification does not. We decided that App Push is sent while publishing, after the notifications are saved, but cannot fail the Outbox Event: a failed POST is logged, not retried. Each notification records when it was pushed to the app (`appPushedAt`, set only after OnePlatform reports success), and only notifications without it are sent, so a retried event never pushes the same notification twice. The Inbox stays the source of truth; App Push and App Badge are conveniences, like Live Push.

## Considered Options

- **Push inside publishing with no record (duplicates on retry)**: rejected because every retry of an event, by the Relay or after a later step fails, would notify every recipient's phone again.
- **A separate outbox or job for App Push, retried until delivered**: rejected for now because it is a second queue with its own lease, cap and relay for a channel that is not the source of truth. It is the upgrade path if App Push ever has to be guaranteed.
- **A failed App Push fails the Outbox Event**: rejected because OnePlatform being down would hold back `markPublished` and re-run rule evaluation and saving for every event, while the Inbox already has the notifications.

## Consequences

- **At most once, not exactly once.** A push that succeeds just before the process dies, before `appPushedAt` is written, is sent again by the next attempt. Writing `appPushedAt` before sending was rejected because a send that then fails would never be retried.
- **Lost pushes are not replayed.** A notification whose App Push failed keeps `appPushedAt` empty, but nothing looks for it once its Outbox Event is published.
- **The App Badge is always the full unread count**, never a difference, so a lost or late `set-badge` is corrected by the next push or read. Mark-read and read-all set it without waiting for it, and skip it when nothing changed.
- **App Push is off without a token.** With no OnePlatform token configured nothing is sent and `appPushedAt` is not written, so turning it on later does not push old notifications retroactively unless their events are published again.
