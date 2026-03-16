# Merchant Publishing API

Reference implementation:

- [packages/modules/src/publishing/api/routes.ts](../../../packages/modules/src/publishing/api/routes.ts)

## Create Draft Config

`POST /tenants/:tenantId/configs`

Request:

```json
{
  "template_id": "basic-commerce",
  "template_version": "v1",
  "config_payload": {
    "brand_name": "Sunrise Fresh",
    "hero_title": "Fresh groceries delivered daily"
  }
}
```

## List Configs

`GET /tenants/:tenantId/configs`

## Get Config

`GET /tenants/:tenantId/configs/:configId`

## Update Draft Config

`PATCH /tenants/:tenantId/configs/:configId`

Request:

```json
{
  "config_payload": {
    "brand_name": "Sunrise Fresh",
    "hero_title": "Fresh groceries delivered daily",
    "hero_subtitle": "Same-day delivery in Kampala",
    "primary_color": "#0B6E4F",
    "cta_label": "Shop now"
  }
}
```

## Publish

`POST /tenants/:tenantId/publish`

Request:

```json
{
  "config_id": "13a0c844-9f36-4de4-92d7-92b19b2fe4ec"
}
```

Publishes the config, writes publish history, writes audit, and emits an outbox event with storefront revalidation targets.

## Rollback

`POST /tenants/:tenantId/rollback`

Request:

```json
{
  "config_id": "13a0c844-9f36-4de4-92d7-92b19b2fe4ec"
}
```

## Common Publishing Error Codes

- `config_invalid_payload`
- `config_schema_mismatch`
- `config_not_found`
- `config_not_draft`
- `config_already_active`
- `publish_validation_failed`
- `revalidation_dispatch_failed`
