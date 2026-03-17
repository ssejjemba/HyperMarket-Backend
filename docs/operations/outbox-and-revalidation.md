# Outbox and Revalidation

## Why It Exists

State changes and side effects must not drift apart.

The codebase uses:

- database transaction for the primary state change
- outbox write in the same transaction
- worker delivery outside the request path

## Components

- Outbox writer: [packages/core/src/outbox/outboxWriter.ts](../../packages/core/src/outbox/outboxWriter.ts)
- Outbox dispatcher: [packages/core/src/outbox/outboxDispatcher.ts](../../packages/core/src/outbox/outboxDispatcher.ts)
- Worker loop: [apps/worker/src/worker.ts](../../apps/worker/src/worker.ts)
- Revalidation queue translation: [apps/worker/src/revalidation/storefrontRevalidationQueue.ts](../../apps/worker/src/revalidation/storefrontRevalidationQueue.ts)
- Notification queue translation: [apps/worker/src/notifications/notificationQueue.ts](../../apps/worker/src/notifications/notificationQueue.ts)

## Supported Revalidation Event Types

- `Publish.Completed`
- `Rollback.Completed`
- `Catalog.ProductUpserted`
- `Catalog.ProductDeleted`
- `Catalog.CategoryUpserted`
- `Catalog.CategoryDeleted`
- `Catalog.ProductCategoryChanged`

## Failure Behavior

- Failed dispatch attempts increment outbox attempt count.
- Revalidation jobs use retries with exponential backoff.
- Permanently failed jobs are moved to the DLQ.
- Notification jobs use retryable vs non-retryable failure classification.
- Notification dispatch jobs move to a notification DLQ when retries are exhausted.

## Operational Checks

When storefront changes do not appear:

1. Check `outbox_events` for undispatched records.
2. Check worker logs for dispatch failures.
3. Check BullMQ queue and DLQ state.
4. Confirm `STOREFRONT_REVALIDATION_URL` and `STOREFRONT_REVALIDATION_TOKEN`.

When notifications do not send:

1. Check `outbox_events` for ORD, PAY, or PUB events that should have produced notifications.
2. Check `notification_jobs` and `notification_delivery_attempts`.
3. Check worker logs for notification scheduling or provider failures.
4. Check Redis queues for `notifications.dispatch` and its DLQ.
