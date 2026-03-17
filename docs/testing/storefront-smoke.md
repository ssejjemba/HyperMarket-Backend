# Storefront Smoke Check

Use the live smoke script to verify the running API against real sample data.

Command:

```bash
corepack pnpm smoke:storefront
```

What the script does:

1. Creates an isolated tenant using the shared testkit bootstrap.
2. Seeds one public category and one public product.
3. Starts the API on a real localhost port.
4. Calls live HTTP endpoints with `fetch`.
5. Creates a real pay-on-delivery order through the storefront API.
6. Closes the server and destroys the seeded data.

Endpoints covered:

- `GET /health/live`
- `GET /health/ready`
- `GET /storefront/:tenantSlug/categories`
- `GET /storefront/:tenantSlug/categories/:categorySlug`
- `GET /storefront/:tenantSlug/products`
- `GET /storefront/:tenantSlug/products/:productSlug`
- `POST /storefront/:tenantSlug/orders`

Expected prerequisites:

- Postgres is running
- Redis is running
- migrations are applied

The script prints a JSON summary on success, including the tenant slug, seeded product/category slugs, and the created order number.
