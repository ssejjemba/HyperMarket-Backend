# Module Boundaries

## Implemented Modules

### IAA

Owns:

- OTP request and verification
- Session issuance and validation
- Logout and logout-all
- Membership-aware session reads for authenticated merchants

Key routes:

- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `GET /auth/session`
- `POST /auth/logout`
- `POST /auth/logout-all`

### TEN

Owns:

- Tenants
- Tenant domains
- Tenant settings
- Tenant memberships

Key routes:

- `POST /tenants`
- `GET /tenants`
- `GET /tenants/:tenantId`
- `GET/PATCH /tenants/:tenantId/settings`
- Membership routes under `/tenants/:tenantId/memberships`

### CAT

Owns:

- Categories
- Products
- Product variants
- Product-category mapping
- Storefront catalog read models
- Catalog outbox events for revalidation and notifications

Key routes:

- Merchant routes under `/tenants/:tenantId/categories` and `/tenants/:tenantId/products`
- Public routes under `/storefront/:tenantSlug/...`

### FUL

Owns:

- tenant fulfillment settings
- delivery zones and fee rules
- business-hours gating
- storefront fulfillment options
- deterministic policy reads used by ORD checkout validation

Key routes:

- `GET/PATCH /tenants/:tenantId/fulfillment/settings`
- `GET/POST /tenants/:tenantId/fulfillment/zones`
- `PATCH/DELETE /tenants/:tenantId/fulfillment/zones/:zoneId`
- `GET /storefront/:tenantSlug/fulfillment/options`

### MED

Owns:

- Media asset metadata
- Upload token issuance
- Upload confirmation
- CDN public URL construction
- Tenant-scoped media listing and soft delete

Key routes:

- `POST /tenants/:tenantId/media/upload-token`
- `POST /tenants/:tenantId/media/confirm`
- `GET /tenants/:tenantId/media`
- `DELETE /tenants/:tenantId/media/:assetId`

### ORD

Owns:

- Authoritative checkout using catalog data
- Order totals and snapshots
- Merchant order listing and detail reads
- Merchant order transitions
- Order outbox events

Key routes:

- `POST /storefront/:tenantSlug/orders`
- `GET /tenants/:tenantId/orders`
- `GET /tenants/:tenantId/orders/:orderId`
- `POST /tenants/:tenantId/orders/:orderId/transition`

### PAY

Owns:

- Payment intent lifecycle
- Flutterwave provider integration
- Webhook verification and reconciliation
- Payment outbox events
- Order payment transitions through the ORD payment port

Key routes:

- `POST /storefront/:tenantSlug/payments/intents`
- `POST /payments/webhooks/:provider`

### NOT

Owns:

- Notification job persistence
- Template registry for notifications
- Event-to-notification planning
- SMS dispatch and retry/DLQ behavior

Runtime location:

- API does not expose NOT routes in MVP
- Worker consumes outbox events and dispatches notification jobs
- Core files live under `packages/modules/src/notifications` and `apps/worker/src/notifications`

### OPS

Owns:

- authenticated operator visibility for tenant-scoped outbox, payment, and notification state
- tenant-scoped DLQ inspection for notification and revalidation queues
- owner-only DLQ replay through HTTP for future dashboard tooling

Key routes:

- `GET /tenants/:tenantId/ops/summary`
- `GET /tenants/:tenantId/ops/outbox`
- `GET /tenants/:tenantId/ops/payments`
- `GET /tenants/:tenantId/ops/notifications`
- `GET /tenants/:tenantId/ops/notifications/:jobId/attempts`
- `GET /tenants/:tenantId/ops/dlq/:target`
- `POST /tenants/:tenantId/ops/dlq/:target/:jobId/replay`

### PUB

Owns:

- Draft store configs
- Publish and rollback workflows
- Revalidation planning and outbox emission

Key routes:

- `/tenants/:tenantId/configs`
- `/tenants/:tenantId/publish`
- `/tenants/:tenantId/rollback`

### TMP

Owns:

- Template registry and schema lookups used by publishing

## Important Cross-Module Rules

- Tenant scope must be applied in repositories and mutations.
- Side effects must be emitted through the outbox, not inline-only.
- Worker delivery must tolerate retries and duplicates.
- PAY does not mutate orders directly; it uses the ORD payment port.
- ORD delegates fulfillment availability and delivery-fee rules to FUL.
- NOT does not decide business timing; it reacts to outbox events from other modules.
- OPS is read-mostly and must stay tenant-scoped; replay-style mutations are owner-only.
- Public storefront reads must never expose internal soft-delete fields.
