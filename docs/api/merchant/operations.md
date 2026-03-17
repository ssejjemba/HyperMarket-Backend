# Merchant Operations API

Reference implementation:

- [packages/modules/src/ops/api/routes.ts](../../../packages/modules/src/ops/api/routes.ts)

These routes require authenticated tenant membership. DLQ replay requires tenant owner access.

## Summary

`GET /tenants/:tenantId/ops/summary`

Returns tenant-scoped counts for:

- outbox backlog
- payment intents by status
- notification jobs by status

Example response:

```json
{
  "outbox": {
    "pending": 3,
    "failed": 1,
    "dispatched": 12
  },
  "payments": {
    "AWAITING_CUSTOMER": 2,
    "SUCCEEDED": 4
  },
  "notifications": {
    "FAILED_RETRYABLE": 1,
    "SENT": 8
  }
}
```

## Outbox Events

`GET /tenants/:tenantId/ops/outbox?status=failed&event_type=Order.Created&limit=20`

Supported `status` values:

- `pending`
- `failed`
- `dispatched`

This endpoint is useful for investigating worker backlog and failed dispatches without shell access.

## Payment Intents

`GET /tenants/:tenantId/ops/payments?status=AWAITING_CUSTOMER&limit=20`

Returns tenant-scoped payment intents with:

- provider
- status
- amount/currency
- `tx_ref`
- provider references and transaction ids
- safe failure fields

## Notification Jobs

`GET /tenants/:tenantId/ops/notifications?status=FAILED_RETRYABLE&limit=20`

Returns notification jobs with:

- event linkage
- template reference
- delivery status
- attempt counts
- safe provider failure details

### Notification Attempts

`GET /tenants/:tenantId/ops/notifications/:jobId/attempts?limit=20`

Returns delivery attempts for a single notification job.

## DLQ Visibility

`GET /tenants/:tenantId/ops/dlq/:target?limit=20`

Supported `target` values:

- `notifications`
- `revalidation`

The response is filtered to jobs whose queue payload includes the current `tenant_id`.

## DLQ Replay

`POST /tenants/:tenantId/ops/dlq/:target/:jobId/replay`

This is owner-only and requeues the selected DLQ job back to the primary queue after removing the stored failure marker.

Typical use:

1. inspect the failed job from the DLQ endpoint
2. resolve the underlying provider or worker issue
3. replay the job
4. confirm the job leaves the DLQ and reappears in normal processing

## Common Error Codes

- `auth_missing_token`
- `tenant_access_forbidden`
- `not_job_not_found`
- `not_found`
- `validation_failed`
