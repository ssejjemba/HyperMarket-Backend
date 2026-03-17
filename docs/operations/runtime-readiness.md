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
