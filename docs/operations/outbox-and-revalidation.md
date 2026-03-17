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

1. Run `corepack pnpm ops:status` to see whether backlog is in outbox, the primary queue, or the DLQ.
2. Check `outbox_events` for undispatched records.
3. Inspect the revalidation DLQ with `corepack pnpm ops:dlq:list revalidation`.
4. Replay recovered jobs with `corepack pnpm ops:dlq:replay revalidation <jobId>`.
5. Confirm `STOREFRONT_REVALIDATION_URL` and `STOREFRONT_REVALIDATION_TOKEN`.

When notifications do not send:

1. Run `corepack pnpm ops:status` to see whether backlog is in outbox or `notifications.dispatch.dlq`.
2. Check `outbox_events` for ORD, PAY, or PUB events that should have produced notifications.
3. Check `notification_jobs` and `notification_delivery_attempts`.
4. Inspect the notification DLQ with `corepack pnpm ops:dlq:list notifications`.
5. Replay recovered jobs with `corepack pnpm ops:dlq:replay notifications <jobId>`.

## Related Runbook

- [Recovery Tooling](./recovery-tooling.md)
