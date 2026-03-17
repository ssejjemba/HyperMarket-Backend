# Storefront Fulfillment API

Reference implementation:

- [packages/modules/src/fulfillment/api/routes.ts](../../../packages/modules/src/fulfillment/api/routes.ts)

## Fulfillment Options

`GET /storefront/:tenantSlug/fulfillment/options`

Returns the public fulfillment policy required by the storefront checkout UI.

Example response:

```json
{
  "fulfillment": {
    "pickup_enabled": true,
    "delivery_enabled": true,
    "pickup_instructions": "Collect from the main branch.",
    "delivery_instructions": "Call on arrival.",
    "currency": "UGX",
    "store_open": true,
    "store_closed_reason": null,
    "delivery_zones": [
      {
        "id": "7a7f43d8-d930-48f3-bbd5-f7d7f45d4116",
        "name": "Ntinda",
        "fee_amount": 4000,
        "min_order_amount": 20000,
        "sort_order": 0
      }
    ]
  }
}
```

Notes:

- only active zones are returned
- internal fields such as audit data are excluded
- `store_open` reflects the current Kampala-local business-hours evaluation
