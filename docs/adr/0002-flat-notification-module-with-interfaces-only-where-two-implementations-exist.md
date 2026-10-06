# Flat notification module, with interfaces only where two implementations exist

The notification module was laid out in layers (`api/`, `core/{rules,ports}/`, `adapters/{persistence,push}/`, `use-cases/{commands,services}/`): 23 files in 10 folders, while every other module in `src/modules/` is a single folder. The layers hid nothing: the command/service split held one file each with no query side (the Inbox already sat at the module root), and three entry files (`module.ts`, `index.ts`, `runtime.ts`) only passed through to one another. We flattened it into one folder that uses the repo's file names (`index.ts` for routes, `model.ts` for request schemas, `type.ts` for types only), and we keep an interface only where it has two implementations, a production adapter and an in-memory test fake, declared in the file that uses it. The three tested interfaces carried the earlier design; the folders around them did not.

## Considered Options

- **Two folders by flow (`inbox/`, `outbox/`)**: rejected because both flows share `type.ts`, `dto.ts` and the push hub (the stream reads from it, publishing writes to it), so they would import across folders from the start.
- **Keep the layered folders and only merge the entry files**: rejected because the folders would still be the only module in the repo laid out this way, while hiding nothing.

## Consequences

- Interfaces kept: `RecipientResolver` in `evaluate-rules.ts`, and `NotificationDelivery` and `PushHub` in `publish-outbox-event.ts`. Each has a Mongo or SSE adapter in production and an in-memory fake in `publish-outbox-event.test.ts`. `PushHub` is only `push()`; the stream route uses `SsePushHub` directly, since nothing else serves a stream.
- Interfaces removed because they had one implementation: the rules engine as a dependency of publishing (publishing an Outbox Event takes the recipient resolver and evaluates the rules itself; the rules config is no longer a parameter), and `WorkflowEventOutboxPublisher` (the dispatcher takes the publish function). Add one back only together with its second implementation, for example a test that runs publishing against a made-up rules config.
- The Mongo adapters are named for what they are (`mongo-recipient-resolver.ts`, `mongo-notification-delivery.ts`). There is no `store.ts`: the Inbox queries notifications directly, so a `store.ts` would not hold all of the module's Mongo access the way it does in other modules.
- `runtime.ts` is the only wiring point. It creates the single SSE push hub and exports `workflowEventDispatcher`, so modules that raise Workflow Events do not load the notification routes.
- Open question, resolved by [ADR-0003](./0003-one-file-owns-outbox-event-writes-relay-publishes-by-id.md): the Outbox Event lifecycle was split. `workflow-event.ts` created the Outbox Event, and the notification delivery adapter locked it and recorded it as published or failed. ADR-0003 moves every Outbox Event write into one file, puts lock, status and find-due behind an `OutboxEvents` interface, and narrows `NotificationDelivery` to `NotificationStore`.
