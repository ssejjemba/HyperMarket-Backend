# API Conventions

## Base Behavior

- JSON request and response bodies
- Shared error envelope from [packages/contracts/src/errors/errorToHttp.ts](../../packages/contracts/src/errors/errorToHttp.ts)
- Request id returned in the `x-request-id` response header

## Error Shape

```json
{
  "request_id": "6af0dca1-6c17-4a2f-9bc6-0d42ad9b8f4b",
  "error_code": "catalog_slug_taken",
  "message": "slug is already in use for this tenant",
  "details": {
    "optional": "context"
  }
}
```

## Authentication

Merchant routes use:

```http
Authorization: Bearer <access_token>
```

## Pagination

List routes use:

- `page`, default `1`
- `page_size`, default `20`

List responses include:

```json
{
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 42
  }
}
```

## Tenant Resolution

- Merchant routes resolve tenant from the path and membership guard.
- Storefront routes resolve tenant by `tenantSlug` in the path.
