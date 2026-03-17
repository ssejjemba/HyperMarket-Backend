# Merchant Orders API

Reference implementation:

- [packages/modules/src/orders/api/routes.ts](../../../packages/modules/src/orders/api/routes.ts)

These routes require authenticated tenant membership. Order transitions require tenant owner access.

## List Orders

`GET /tenants/:tenantId/orders?status=PENDING&cursor=<cursor>&limit=20`

Response:

```json
{
  "orders": [
    {
      "id": "8e352ac5-ff5a-4b22-b94b-d29620c13750",
      "tenant_id": "<tenantId>",
      "order_number": 1,
      "status": "PENDING",
      "checkout_mode": "pay_on_delivery",
      "currency": "UGX",
      "subtotal_amount": 3500,
      "delivery_fee_amount": 0,
      "discount_amount": 0,
      "total_amount": 3500,
      "customer_id": null,
      "customer_snapshot": {},
      "fulfillment_snapshot": {
        "type": "pickup",
        "pickup_location_label": "Acacia Mall"
      },
      "notes": null,
      "created_at": "2026-03-17T12:00:00.000Z",
      "updated_at": "2026-03-17T12:00:00.000Z"
    }
  ],
  "next_cursor": null
}
```

## Get Order Details

`GET /tenants/:tenantId/orders/:orderId`

Returns the order, optional customer record, line items, and order history.

## Transition Order

`POST /tenants/:tenantId/orders/:orderId/transition`

Request:

```json
{
  "action": "confirm",
  "reason": "Ready for pickup"
}
```

Allowed merchant actions:

- `confirm`
- `cancel`
- `fulfill`

## Common Order Error Codes

- `order_invalid_items`
- `order_product_not_found`
- `order_variant_not_found`
- `order_product_not_available`
- `order_quantity_invalid`
- `order_fulfillment_invalid`
- `order_invalid_state_transition`
- `order_not_found`
- `order_validation_failed`
