# Runtime Readiness

This backend now has basic runtime hardening for production-style environments.

## Health Endpoints

Use these endpoints from your load balancer or orchestration platform:

- `GET /health`
  - compatibility liveness check
- `GET /health/live`
  - liveness only
- `GET /health/ready`
  - readiness check against Postgres and Redis

`/health/ready` returns:

- `200` when both dependencies are reachable
- `503` when either dependency is unavailable

Response shape:

```json
{
  "status": "ready",
  "request_id": "f92c4c2a-9f7e-46ff-bf36-57c4235cfb61",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

## Metrics Endpoints

The API now exposes:

- `GET /metrics`

The worker exposes:

- `GET /metrics` on `WORKER_METRICS_HOST:WORKER_METRICS_PORT`
- `GET /health/live` on the same worker metrics server

Current metrics coverage includes:

- IAA OTP/session counters
- MED upload/confirm/delete counters
- storefront revalidation DLQ counters
- worker queue depth by queue/state
- outbox backlog gauges

## Authenticated Operator Endpoints

The API now exposes tenant-scoped operator endpoints for dashboard tooling:

- `GET /tenants/:tenantId/ops/summary`
- `GET /tenants/:tenantId/ops/outbox`
- `GET /tenants/:tenantId/ops/payments`
- `GET /tenants/:tenantId/ops/notifications`
- `GET /tenants/:tenantId/ops/notifications/:jobId/attempts`
- `GET /tenants/:tenantId/ops/dlq/:target`
- `POST /tenants/:tenantId/ops/dlq/:target/:jobId/replay`

Access rules:

- read endpoints require tenant membership
- DLQ replay requires tenant owner access

This closes the gap between CLI-only recovery and future frontend operator tools.

## Public Abuse Controls

Storefront write endpoints are Redis-rate-limited:

- `POST /storefront/:tenantSlug/orders`
- `POST /storefront/:tenantSlug/payments/intents`

When the limit is exceeded:

- the API returns `429`
- the response includes `Retry-After`
- the body uses `error_code=rate_limited`

Environment variables:

- `PUBLIC_ORDER_RATE_LIMIT_WINDOW_SECONDS`
- `PUBLIC_ORDER_RATE_LIMIT_MAX`
- `PUBLIC_PAYMENT_RATE_LIMIT_WINDOW_SECONDS`
- `PUBLIC_PAYMENT_RATE_LIMIT_MAX`

## Graceful Shutdown

Both the API process and worker handle `SIGINT` and `SIGTERM`.

API shutdown behavior:

- stop accepting new requests
- close Fastify
- close the shared Postgres client

Worker shutdown behavior:

- stop the outbox polling loop
- wake any sleeping poll interval immediately
- close BullMQ workers and queues
- close the Postgres client

This is the minimum required for clean deploy restarts and container termination.
