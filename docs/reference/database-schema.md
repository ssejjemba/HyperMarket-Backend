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

## Media Tables

- `media_assets`

## Fulfillment Tables

- `fulfillment_settings`
- `delivery_zones`

## Orders Tables

- `customers`
- `orders`
- `order_items`
- `order_state_history`

## Payments Tables

- `payment_intents`
- `payment_provider_events`

## Notifications Tables

- `notification_jobs`
- `notification_delivery_attempts`

Catalog migration:

- [packages/core/db/migrations/202603160001_create_catalog_tables.ts](../../packages/core/db/migrations/202603160001_create_catalog_tables.ts)

## Catalog Schema Notes

- Shared-schema multi-tenancy with `tenant_id`
- Per-tenant unique slugs for products and categories
- `price_amount` stored in integer minor units
- Variants stored separately from products
- Product-category mapping stored in `product_categories`
- Soft delete implemented with `deleted_at` on categories and products

## Other Schema Notes

- Media assets use tenant-scoped `storage_key` uniqueness.
- Fulfillment rules are split between one tenant settings row and relational delivery zones.
- Orders store immutable customer and fulfillment snapshots on the order record.
- Payments keep intent state separate from order state.
- Notification jobs use a DB-level unique `dedupe_key` for duplicate scheduling protection.
