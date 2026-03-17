# Merchant Fulfillment API

Reference implementation:

- [packages/modules/src/fulfillment/api/routes.ts](../../../packages/modules/src/fulfillment/api/routes.ts)

These routes require authenticated tenant membership. Mutations require tenant owner access.

## Settings

`GET /tenants/:tenantId/fulfillment/settings`

Returns the tenant fulfillment settings. If no settings row has been created yet, the API returns the default policy:

- `pickup_enabled=true`
- `delivery_enabled=false`
- empty instructions
- empty `business_hours`

`PATCH /tenants/:tenantId/fulfillment/settings`

Supported fields:

```json
{
  "pickup_enabled": true,
  "delivery_enabled": true,
  "pickup_instructions": "Collect from the main branch.",
  "delivery_instructions": "Call on arrival.",
  "business_hours": {
    "mon": {
      "is_closed": false,
      "open_time": "09:00",
      "close_time": "17:00"
    }
  }
}
```

Important rules:

- at least one fulfillment mode must remain enabled
- delivery cannot be enabled without at least one active delivery zone
- business hours must use `mon`..`sun` and `HH:MM`

## Delivery Zones

`GET /tenants/:tenantId/fulfillment/zones?include_inactive=false`

Returns delivery zones ordered by `sort_order`.

`POST /tenants/:tenantId/fulfillment/zones`

```json
{
  "name": "Kololo",
  "fee_amount": 4000,
  "min_order_amount": 20000,
  "sort_order": 0
}
```

`PATCH /tenants/:tenantId/fulfillment/zones/:zoneId`

Supports partial updates for:

- `name`
- `fee_amount`
- `min_order_amount`
- `sort_order`
- `is_active`

`DELETE /tenants/:tenantId/fulfillment/zones/:zoneId`

This is a soft deactivation implemented by setting `is_active=false`.

## Common Error Codes

- `ful_no_fulfillment_mode_enabled`
- `ful_delivery_enabled_without_zones`
- `ful_settings_invalid`
- `ful_zone_not_found`
- `ful_zone_inactive`
- `ful_zone_name_taken`
- `ful_zone_invalid`
