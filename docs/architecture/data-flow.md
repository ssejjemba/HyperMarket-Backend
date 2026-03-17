# Data Flow and Reliability

## Request Flow

1. Fastify receives the request.
2. Auth and tenant guards resolve session and membership where required.
3. Route-level validation parses params, query, and body.
4. Use cases coordinate repositories and transaction boundaries.
5. Audit events and outbox events are written inside the same transaction as state changes.
6. Worker polls outbox records and enqueues downstream jobs when relevant.

## Outbox Model

The outbox table is the source of truth for asynchronous side effects.

Common event families in the current codebase:

- `Order.Created`
- `Order.StateChanged`
- `Order.Cancelled`
- `Order.Fulfilled`
- `Payment.Succeeded`
- `Payment.Failed`
- `Publish.Completed`
- `Rollback.Completed`
- `Catalog.ProductUpserted`
- `Catalog.ProductDeleted`
- `Catalog.CategoryUpserted`
- `Catalog.CategoryDeleted`
- `Catalog.ProductCategoryChanged`

## Worker Flows

The worker currently handles two independent flows from the same outbox poll loop:

- storefront revalidation job enqueueing
- notification job scheduling and notification dispatch queueing

Outbox records are only marked dispatched after all applicable side effects for that event have been enqueued successfully.

## Revalidation Flow

1. Publishing or catalog mutation writes an outbox event with `targets`.
2. Worker reads pending outbox records.
3. Worker converts supported events into BullMQ jobs.
4. Worker sends the revalidation HTTP request to the storefront endpoint.

## Notification Flow

1. ORD, PAY, or PUB writes an outbox event with notification-safe payload fields.
2. Worker reads the event and passes it to the notification plan builder.
3. Planned notifications are persisted in `notification_jobs` with a dedupe key.
4. Worker enqueues notification dispatch jobs.
5. Dispatch worker renders a typed template and calls the channel provider.
6. Delivery attempts are recorded and jobs move to `SENT`, `FAILED_RETRYABLE`, or `DEAD`.

References:

- [packages/core/src/outbox/outboxWriter.ts](../../packages/core/src/outbox/outboxWriter.ts)
- [packages/core/src/outbox/outboxDispatcher.ts](../../packages/core/src/outbox/outboxDispatcher.ts)
- [apps/worker/src/worker.ts](../../apps/worker/src/worker.ts)
- [apps/worker/src/revalidation/storefrontRevalidationQueue.ts](../../apps/worker/src/revalidation/storefrontRevalidationQueue.ts)
- [apps/worker/src/notifications/notificationQueue.ts](../../apps/worker/src/notifications/notificationQueue.ts)
