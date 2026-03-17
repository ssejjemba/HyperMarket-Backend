# Storefront Smoke Check

Use the live smoke script to verify the running API against real sample data.

Command:

```bash
corepack pnpm smoke:storefront
```

What the script does:

1. Creates an isolated tenant using the shared testkit bootstrap.
2. Seeds one public category and one public product.
3. Seeds a merchant owner and issues a real auth token.
4. Starts the API on a real localhost port.
5. Calls live HTTP endpoints with `fetch`.
6. Scrapes the live API `/metrics` endpoint.
7. Creates a real pay-on-delivery order through the storefront API.
8. Seeds tenant-scoped payment, notification, and DLQ records.
9. Calls the authenticated operator endpoints.
10. Replays a real notification DLQ job through the HTTP ops surface.
11. Closes the server and destroys the seeded data.

Endpoints covered:

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /storefront/:tenantSlug/categories`
- `GET /storefront/:tenantSlug/categories/:categorySlug`
- `GET /storefront/:tenantSlug/products`
- `GET /storefront/:tenantSlug/products/:productSlug`
- `POST /storefront/:tenantSlug/orders`
- `GET /tenants/:tenantId/ops/summary`
- `GET /tenants/:tenantId/ops/payments`
- `GET /tenants/:tenantId/ops/notifications`
- `GET /tenants/:tenantId/ops/notifications/:jobId/attempts`
- `GET /tenants/:tenantId/ops/dlq/notifications`
- `POST /tenants/:tenantId/ops/dlq/notifications/:jobId/replay`

Expected prerequisites:

- Postgres is running
- Redis is running
- migrations are applied

The script prints a JSON summary on success, including the tenant slug, seeded product/category slugs, and the created order number.
