# HyperMarket Backend

A modular-monolith backend for a multi-tenant commerce SaaS powering merchant builder operations, public storefront runtime, payments, notifications, and an extension-ready analytics/marketing platform.

This repository implements the contracts and guarantees defined in the system design:
- Strict tenant isolation in every repository call.
- Idempotent commerce flows (orders, payments, publish, webhooks).
- Outbox-based event emission for reliable side effects.
- Recoverable publishing with revalidation.
- Operational observability (logs, metrics, tracing, audit).

---

## Scope and objectives (MVP)

- Merchant builder operations: configuration, catalog, orders, publishing.
- Public storefront runtime: tenant resolution, public reads, checkout flows.
- Integrations: payments, notifications.
- Extension-ready event platform for analytics and marketing.

---

## Architecture stance

### Modular monolith (MVP)

Single deployable service with strict internal module boundaries. Each module owns:
- Domain model and invariants
- Persistence access patterns (via its repositories)
- External integration adapters
- Event contracts (published and consumed)

No module reads another module’s tables directly. Cross-module interaction occurs through:
- Application-layer interfaces (commands/queries), or
- Domain/integration events via the event bus.

### Communication model
- Synchronous HTTP for interactive operations (dashboard + storefront).
- Asynchronous events for side effects and integrations (revalidation, notifications, analytics, reconciliation).

### Reliability baseline
- ACID transactions for state changes.
- Outbox pattern for event emission.
- Idempotency keys for client retries.
- Idempotent webhook processing for provider retries.

---

## Standard module layering

All modules follow the same internal layers:
1. API Layer: controllers, request validation, auth + tenant resolution
2. Application Layer: commands/queries, orchestration, transaction boundaries, outbox writes
3. Domain Layer: entities, value objects, invariants, state machines
4. Persistence Layer: tenant-scoped repositories, query optimization, migrations
5. Integration Layer: external providers, queues/streams, retries, circuit breakers
6. Observability Layer: structured logging, metrics, tracing, audit events

---

## Backend modules

### MVP modules
1. Identity & Access (IAA)
2. Tenant & Storefront Configuration (TEN)
3. Template Registry & Schema (TMP)
4. Catalog (CAT)
5. Checkout & Orders (ORD)
6. Payments (PAY)
7. Fulfillment & Delivery (FUL)
8. Media & Assets (MED)
9. Publishing & Revalidation (PUB)
10. Notifications (NOT)

### Extension-ready modules
11. Analytics & Event Platform (ANL)
12. Marketing (MKT)

### Allowed interactions (high level)
- IAA → TEN
- TEN → TMP, PUB
- ORD → CAT, FUL, PAY, NOT
- PAY → ORD, NOT
- PUB → TMP, TEN, NOT
- MED → TEN
- CAT → ANL
- MKT → ANL, CAT, ORD, NOT

Hard rules:
- Payments does not mutate Orders without going through an Orders transition interface.
- Analytics ingestion never blocks checkout or publishing.
- Tenant scope is mandatory across all modules.

---

## Core cross-cutting contracts

### Tenant resolution
- Builder: tenant derived from session claims + selected store.
- Storefront: tenant derived from host mapping (subdomain → tenant_id).

Failure behavior:
- Storefront: return “Store not found”, log `tenant_resolution_failed`.
- Builder: 404/403 based on membership status.

### Configuration snapshots
Storefront rendering consumes an active configuration snapshot:
- `template_id`, `template_version`, `theme_tokens`
- `page/section config`, `seo config`, `feature toggles`

Config is validated against schema for `template_id + template_version` prior to activation.

### Event contract
Events are JSON, stored in the Outbox within the same transaction as the state change, published by a dispatcher, and consumed idempotently.

Required envelope fields:
- `event_id`, `event_type`, `occurred_at`, `tenant_id`, `correlation_id`, `actor_user_id`, `payload`

---

## Non-negotiable implementation rules

1. Tenant scope is mandatory in every repository call.
2. Idempotency is required for order creation, payment intent creation, publish, and webhook processing.
3. Outbox is required for publish, order created, payment updates, and any workflow that triggers external side effects.
4. Orders and payments use explicit state machines; no ad hoc updates.
5. Analytics is eventually consistent and never blocks checkout, publishing, or storefront rendering.
6. All list endpoints are paginated and indexed by tenant and time.
7. Every critical state change produces an audit entry.

---

## Key flows (overview)

### Publish (transaction + outbox + revalidation)
- Validate config against template schema
- Transactionally activate config and write outbox event
- Asynchronously dispatch revalidation
- Rollback uses the same mechanism

### Order creation (idempotent)
- Upsert idempotency record
- Create order + items in a single transaction
- Return existing order on retry with same key

### Payment webhook reconciliation (idempotent)
- Verify signature
- Upsert provider event id
- Update payment intent + transition order (if valid)
- Emit outbox events

---

## Observability standards

### Logging
Every request log line includes:
- `timestamp`, `level`, `module`
- `request_id`, `trace_id`, `correlation_id`
- `tenant_id` (when resolved), `user_id` (builder context)
- `route`, `method`, `status_code`, `latency_ms`
- `event_name`, `error_code`

Never log OTP codes, tokens, secrets, or provider signatures. Mask phone numbers (last 3–4 digits only).

### Metrics (minimum viable)
- API latency p50/p95/p99 per route group
- API error rate per module
- Publish success rate, revalidation lag
- Queue depth, retry count, DLQ size
- Order creation rate, idempotency replay rate
- Payment success rate, webhook lag, reconciliation count
- Tenant resolution failure rate

### Audit log
Append-only audit events for:
- publish/rollback
- product price changes and deletions
- manual order transitions
- payment overrides/refunds
- membership changes

---

## Failure modes and recovery (summary)

- Tenant resolution failure: verify domain mapping, invalidate cache, add domain checks.
- Publish validation failure: return structured errors, add contract tests, pin schema versions.
- Publish revalidation failure: check queue depth, retry dispatch, operator re-run endpoint.
- Duplicate orders from retries: enforce idempotency per tenant + operation.
- Payment webhook delays/duplicates: idempotent ingestion, scheduled reconciliation, alert on lag.
- Notification failures: retry with backoff, DLQ replay, template rollback.
- Database saturation: pagination, indexes, pooling, timeouts, add replicas later.

---

## Repository structure (planned)

This repository is currently scaffolding the backend. The following layout is the target structure:

```
/README.md
/src
  /modules
    /identity-access
    /tenant
    /template-registry
    /catalog
    /orders
    /payments
    /fulfillment
    /media
    /publishing
    /notifications
    /analytics
    /marketing
  /shared
    /auth
    /tenancy
    /outbox
    /observability
    /http
    /db
/migrations
/scripts
/docs
```

---

## Getting started

This project is in the architecture/specification stage.

- Runtime: TBD
- Package manager: TBD
- Local dev: TBD

When bootstrapping begins, this section should include:
- Environment variables (.env.example)
- Database setup + migrations
- Running the API
- Running async workers (outbox dispatcher, notifications, reconciliation)

---

## Contributing

- Keep module boundaries strict (no cross-module table reads).
- Enforce tenant scoping and idempotency in all write flows.
- Add audit events for critical state changes.
- Add tests for state machines and outbox emission.

---

## License

TBD
