# Recovery Tooling

The repo now includes CLI-first operator tooling for queue and outbox recovery.

## Commands

Status snapshot:

```bash
corepack pnpm ops:status
```

List DLQ jobs:

```bash
corepack pnpm ops:dlq:list notifications
corepack pnpm ops:dlq:list revalidation 50
```

Replay a single DLQ job:

```bash
corepack pnpm ops:dlq:replay notifications <jobId>
corepack pnpm ops:dlq:replay revalidation <jobId>
```

## What `ops:status` Reports

- BullMQ counts for:
  - `notifications.dispatch`
  - `notifications.dispatch.dlq`
  - `storefront.revalidate`
  - `storefront.revalidate.dlq`
- outbox backlog grouped by `event_type`
- total outbox records with retry attempts
- the oldest undispatched outbox record

This is the fastest way to answer:

- Is the worker draining?
- Is the DLQ growing?
- Is the outbox stuck before queueing?

## DLQ Replay Rules

Replay currently works one job at a time.

Behavior:

1. Load the requested job from the selected DLQ.
2. Re-enqueue the original payload onto the primary queue.
3. Remove the job from the DLQ after successful enqueue.

The replay command strips the stored `error_message` field before requeueing so the retried payload matches the normal queue shape.

## Recommended Recovery Flow

When storefront revalidation is failing:

1. Run `corepack pnpm ops:status`.
2. Check whether backlog is in `outbox` or already in `storefront.revalidate.dlq`.
3. Fix the underlying storefront callback or token issue.
4. Inspect the DLQ with `corepack pnpm ops:dlq:list revalidation`.
5. Replay affected jobs with `corepack pnpm ops:dlq:replay revalidation <jobId>`.

When notifications are failing:

1. Run `corepack pnpm ops:status`.
2. Check `notification_jobs` and `notification_delivery_attempts`.
3. Inspect `notifications.dispatch.dlq`.
4. Fix the provider or payload issue.
5. Replay specific jobs after the root cause is resolved.

## Source Files

- [runtimeStatus.ts](../../apps/worker/src/ops/runtimeStatus.ts)
- [dlq.ts](../../apps/worker/src/ops/dlq.ts)
- [runtimeOps.ts](../../apps/worker/src/ops/runtimeOps.ts)
