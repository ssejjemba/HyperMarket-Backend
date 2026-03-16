# Storefront Catalog API

Reference implementation:

- [packages/modules/src/catalog/api/routes.ts](../../../packages/modules/src/catalog/api/routes.ts)

These routes are public. They do not require authentication.

## Resolve Tenant

Current storefront routes use:

```text
/storefront/:tenantSlug/...
```

Example tenant slug:

```text
sunrise-fresh
```

## List Categories

`GET /storefront/:tenantSlug/categories`

Example:

```bash
curl http://localhost:3000/storefront/sunrise-fresh/categories
```

Response:

```json
{
  "categories": [
    {
      "id": "e6ebc0e8-24e5-4fa9-bc1e-36ea2e8df401",
      "name": "Fresh Dairy",
      "slug": "fresh-dairy",
      "description": "Milk, yoghurt, butter, and cheese",
      "sort_order": 10
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

## Get Category and Its Products

`GET /storefront/:tenantSlug/categories/:categorySlug`

Example:

```bash
curl http://localhost:3000/storefront/sunrise-fresh/categories/fresh-dairy
```

Response:

```json
{
  "category": {
    "id": "e6ebc0e8-24e5-4fa9-bc1e-36ea2e8df401",
    "name": "Fresh Dairy",
    "slug": "fresh-dairy",
    "description": "Milk, yoghurt, butter, and cheese",
    "sort_order": 10
  },
  "products": [
    {
      "id": "43315029-f837-47f3-8bb5-2e72d253fd90",
      "name": "Fresh Milk 1L",
      "slug": "fresh-milk-1l",
      "description": "Pasteurised whole milk",
      "primary_image_asset_id": null,
      "price_amount": 3500,
      "compare_at_price_amount": 4000,
      "currency": "UGX",
      "sku": "MILK-1L",
      "attributes": {
        "brand": "Sunrise",
        "unit": "1 litre"
      },
      "variants": [
        {
          "id": "4cfb3e92-98e5-450f-b492-e4a8f41ca7c4",
          "name": "1L",
          "sku": "MILK-1L",
          "price_amount": 3500,
          "stock_quantity": 48,
          "options": {
            "size": "1L"
          }
        }
      ],
      "category_ids": ["e6ebc0e8-24e5-4fa9-bc1e-36ea2e8df401"]
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

## List Products

`GET /storefront/:tenantSlug/products`

Example:

```bash
curl http://localhost:3000/storefront/sunrise-fresh/products
```

Only active, non-deleted products are returned.

## Get Product by Slug

`GET /storefront/:tenantSlug/products/:productSlug`

Example:

```bash
curl http://localhost:3000/storefront/sunrise-fresh/products/fresh-milk-1l
```

## Visibility Rules

Public storefront routes only return:

- Categories where `is_visible=true` and `deleted_at is null`
- Products where `status='active'` and `deleted_at is null`

They never return internal-only fields such as `deleted_at`.

## Sample Test Data

Use:

- [Public Catalog Sample Data Guide](../../testing/public-catalog-sample-data.md)
- [SQL Fixture](../../testing/fixtures/public-catalog.sql)
- [Expected JSON Fixture](../../testing/fixtures/public-catalog.json)
