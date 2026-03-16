# Module Boundaries

## Implemented Modules

### IAA

Owns:

- OTP request and verification
- Session issuance and validation
- Logout and logout-all

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

Key routes:

- Merchant routes under `/tenants/:tenantId/categories` and `/tenants/:tenantId/products`
- Public routes under `/storefront/:tenantSlug/...`

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
- Public storefront reads must never expose internal soft-delete fields.
