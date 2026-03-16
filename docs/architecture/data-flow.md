# Data Flow and Reliability

## Request Flow

1. Fastify receives the request.
2. Auth and tenant guards resolve session and membership where required.
3. Route-level validation parses params, query, and body.
4. Use cases coordinate repositories and transaction boundaries.
5. Audit events and outbox events are written inside the same transaction as state changes.
6. Worker polls outbox records and enqueues storefront revalidation jobs when relevant.

## Outbox Model

The outbox table is the source of truth for asynchronous side effects.

Common event families in the current codebase:

- `Publish.Completed`
- `Rollback.Completed`
- `Catalog.ProductUpserted`
- `Catalog.ProductDeleted`
- `Catalog.CategoryUpserted`
- `Catalog.CategoryDeleted`
- `Catalog.ProductCategoryChanged`

## Revalidation Flow

1. Publishing or catalog mutation writes an outbox event with `targets`.
2. Worker reads pending outbox records.
3. Worker converts supported events into BullMQ jobs.
4. Worker sends the revalidation HTTP request to the storefront endpoint.

References:

- [packages/core/src/outbox/outboxWriter.ts](../../packages/core/src/outbox/outboxWriter.ts)
- [packages/core/src/outbox/outboxDispatcher.ts](../../packages/core/src/outbox/outboxDispatcher.ts)
- [apps/worker/src/revalidation/storefrontRevalidationQueue.ts](../../apps/worker/src/revalidation/storefrontRevalidationQueue.ts)
