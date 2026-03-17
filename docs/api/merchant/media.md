# Merchant Media API

Reference implementation:

- [packages/modules/src/media/api/routes.ts](../../../packages/modules/src/media/api/routes.ts)

These routes require authenticated tenant membership. Delete requires tenant owner access.

## Issue Upload Token

`POST /tenants/:tenantId/media/upload-token`

Request:

```json
{
  "mime_type": "image/png",
  "byte_size": 1024,
  "original_filename": "milk.png"
}
```

Response:

```json
{
  "asset_id": "9ecb7a58-7ae5-4eb2-a6a8-e1a16e53c31f",
  "storage_key": "tenants/<tenantId>/assets/<assetId>/milk.png",
  "upload_url": "http://localhost:3002/uploads/...",
  "upload_headers": {
    "content-type": "image/png"
  },
  "expires_at": "2026-03-17T12:00:00.000Z",
  "constraints": {
    "max_file_bytes": 5242880,
    "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]
  }
}
```

## Confirm Upload

`POST /tenants/:tenantId/media/confirm`

Request:

```json
{
  "asset_id": "9ecb7a58-7ae5-4eb2-a6a8-e1a16e53c31f",
  "storage_key": "tenants/<tenantId>/assets/<assetId>/milk.png",
  "mime_type": "image/png",
  "byte_size": 1024,
  "checksum": "optional"
}
```

## List Assets

`GET /tenants/:tenantId/media?cursor=<cursor>&limit=20`

Response:

```json
{
  "assets": [
    {
      "id": "9ecb7a58-7ae5-4eb2-a6a8-e1a16e53c31f",
      "tenant_id": "<tenantId>",
      "storage_key": "tenants/<tenantId>/assets/<assetId>/milk.png",
      "mime_type": "image/png",
      "byte_size": 1024,
      "width": null,
      "height": null,
      "checksum": "optional",
      "status": "confirmed",
      "created_by_user_id": "<userId>",
      "created_at": "2026-03-17T12:00:00.000Z",
      "deleted_at": null,
      "public_url": "http://localhost:3002/cdn/tenants/<tenantId>/assets/<assetId>/milk.png"
    }
  ],
  "next_cursor": null
}
```

## Delete Asset

`DELETE /tenants/:tenantId/media/:assetId`

This is a soft delete.

## Common Media Error Codes

- `media_mime_not_allowed`
- `media_file_too_large`
- `media_upload_token_failed`
- `media_asset_not_found`
- `media_storage_key_mismatch`
- `media_confirm_failed`
- `media_delete_failed`
- `media_validation_failed`
