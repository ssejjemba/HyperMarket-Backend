# Merchant Catalog API

Reference implementation:

- [packages/modules/src/catalog/api/routes.ts](../../../packages/modules/src/catalog/api/routes.ts)

## Categories

### Create Category

`POST /tenants/:tenantId/categories`

Request:

```json
{
  "name": "Fresh Dairy",
  "slug": "fresh-dairy",
  "description": "Milk, yoghurt, butter, and cheese",
  "sort_order": 10,
  "is_visible": true
}
```

Response:

```json
{
  "category": {
    "id": "6cb41c1d-b268-4bc7-9225-9872baf1b666",
    "tenant_id": "4bc73e5f-288f-4be3-9f91-3cefb8c5401b",
    "name": "Fresh Dairy",
    "slug": "fresh-dairy",
    "description": "Milk, yoghurt, butter, and cheese",
    "sort_order": 10,
    "is_visible": true,
    "created_at": "2026-03-16T18:00:00.000Z",
    "updated_at": "2026-03-16T18:00:00.000Z"
  }
}
```

### Update Category

`PATCH /tenants/:tenantId/categories/:categoryId`

Request body is partial. At least one field is required.

### Delete Category

`DELETE /tenants/:tenantId/categories/:categoryId`

This is a soft delete.

### List Categories

`GET /tenants/:tenantId/categories?page=1&page_size=20&is_visible=true`

Optional query params:

- `page`
- `page_size`
- `include_deleted`
- `is_visible`

## Products

### Create Product

`POST /tenants/:tenantId/products`

Request:

```json
{
  "name": "Fresh Milk 1L",
  "slug": "fresh-milk-1l",
  "description": "Pasteurised whole milk",
  "status": "active",
  "primary_image_asset_id": null,
  "price_amount": 3500,
  "compare_at_price_amount": 4000,
  "currency": "UGX",
  "track_inventory": true,
  "stock_quantity": 48,
  "sku": "MILK-1L",
  "attributes": {
    "brand": "Sunrise",
    "unit": "1 litre"
  },
  "variants": [
    {
      "name": "1L",
      "sku": "MILK-1L",
      "price_amount": 3500,
      "stock_quantity": 48,
      "options": {
        "size": "1L"
      }
    }
  ]
}
```

### Update Product

`PATCH /tenants/:tenantId/products/:productId`

Partial body. At least one field is required.

### Delete Product

`DELETE /tenants/:tenantId/products/:productId`

Soft delete only. The product is marked archived and excluded from public storefront reads.

### List Products

`GET /tenants/:tenantId/products?page=1&page_size=20&status=active`

Optional query params:

- `page`
- `page_size`
- `include_deleted`
- `status`

## Replace Product Categories

`PUT /tenants/:tenantId/products/:productId/categories`

Request:

```json
{
  "category_ids": ["6cb41c1d-b268-4bc7-9225-9872baf1b666", "6eb8c503-fdc9-4eab-8d8e-b2c50584961d"]
}
```

The mapping is replaced transactionally.

## Catalog Rules Enforced by the API

- Product and category slugs must be lowercase and tenant-unique.
- `currency` must be `UGX`.
- `price_amount` must be `>= 0`.
- `compare_at_price_amount`, if provided, must be greater than `price_amount`.
- If `track_inventory=false`, `stock_quantity` is normalized away.

## Common Catalog Error Codes

- `catalog_product_not_found`
- `catalog_category_not_found`
- `catalog_slug_invalid`
- `catalog_slug_taken`
- `catalog_price_invalid`
- `catalog_currency_not_supported`
- `catalog_inventory_rule_violation`
- `catalog_validation_failed`
