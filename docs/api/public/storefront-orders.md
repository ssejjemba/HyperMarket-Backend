# Storefront Orders API

Reference implementation:

- [packages/modules/src/orders/api/routes.ts](../../../packages/modules/src/orders/api/routes.ts)

These routes are public storefront routes. They do not require merchant authentication.

## Create Order

`POST /storefront/:tenantSlug/orders`

Required header:

```http
Idempotency-Key: <stable-client-key>
```

Request:

```json
{
  "checkout_mode": "pay_on_delivery",
  "items": [
    {
      "product_slug": "fresh-milk-1l",
      "quantity": 1
    }
  ],
  "customer": {
    "full_name": "Amina",
    "phone_e164": "+256712345678"
  },
  "fulfillment": {
    "type": "pickup",
    "pickup_location_label": "Acacia Mall"
  },
  "notes": "Call on arrival"
}
```

Response:

```json
{
  "order_id": "8e352ac5-ff5a-4b22-b94b-d29620c13750",
  "order_number": 1,
  "status": "PENDING",
  "totals": {
    "currency": "UGX",
    "subtotal_amount": 3500,
    "delivery_fee_amount": 0,
    "discount_amount": 0,
    "total_amount": 3500
  }
}
```

## Notes

- ORD prices items from CAT data server-side. Client-submitted totals are not trusted.
- Checkout is idempotent per tenant and request body.
- Current public order status lookup is not exposed as a storefront route.
