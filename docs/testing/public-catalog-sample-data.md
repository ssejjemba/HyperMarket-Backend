# Public Catalog Sample Data

This guide seeds a tenant and enough catalog data to exercise the public storefront API.

Use these files together:

- [SQL Fixture](./fixtures/public-catalog.sql)
- [Expected JSON Fixture](./fixtures/public-catalog.json)

## What the Fixture Creates

- Tenant slug: `sunrise-fresh`
- Two visible categories
- Two active products
- One archived product that should not appear in public endpoints
- Variants and product-category mappings

## Apply the Fixture

```bash
psql "$DATABASE_URL" -f docs/testing/fixtures/public-catalog.sql
```

## Test the Public API

### Categories

```bash
curl http://localhost:3000/storefront/sunrise-fresh/categories | jq
```

### Category Page

```bash
curl http://localhost:3000/storefront/sunrise-fresh/categories/fresh-dairy | jq
```

### Product List

```bash
curl http://localhost:3000/storefront/sunrise-fresh/products | jq
```

### Product Detail

```bash
curl http://localhost:3000/storefront/sunrise-fresh/products/fresh-milk-1l | jq
```

## Cleanup

```sql
delete from product_categories where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from product_variants where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from products where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from categories where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from tenant_domains where tenant_id = '11111111-1111-1111-1111-111111111111';
delete from tenants where id = '11111111-1111-1111-1111-111111111111';
```
