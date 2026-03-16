# Database Schema Summary

Type-level schema:

- [packages/core/src/db/client.ts](../../packages/core/src/db/client.ts)

Migrations:

- [packages/core/db/migrations](../../packages/core/db/migrations)

## Core Tables

- `users`
- `sessions`
- `auth_otps`
- `tenants`
- `tenant_domains`
- `tenant_memberships`
- `tenant_settings`
- `audit_events`
- `outbox_events`
- `idempotency_keys`

## Publishing Tables

- `store_configs`
- `publish_history`

## Catalog Tables

- `categories`
- `products`
- `product_variants`
- `product_categories`

Catalog migration:

- [packages/core/db/migrations/202603160001_create_catalog_tables.ts](../../packages/core/db/migrations/202603160001_create_catalog_tables.ts)

## Catalog Schema Notes

- Shared-schema multi-tenancy with `tenant_id`
- Per-tenant unique slugs for products and categories
- `price_amount` stored in integer minor units
- Variants stored separately from products
- Product-category mapping stored in `product_categories`
- Soft delete implemented with `deleted_at` on categories and products
