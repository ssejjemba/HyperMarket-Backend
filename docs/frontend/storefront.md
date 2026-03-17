# Storefront Integration

This page explains how to build a customer-facing storefront against the backend.

## Storefront Route Base

Public storefront routes use this pattern:

```text
/storefront/:tenantSlug/...
```

Example tenant:

```text
sunrise-fresh
```

Example route:

```text
/storefront/sunrise-fresh/products
```

## Typical Storefront Pages And The Backend Calls They Need

### Home page

Usually needs:

- categories
- product listing
- possibly fulfillment options

Typical calls:

- `GET /storefront/:tenantSlug/categories`
- `GET /storefront/:tenantSlug/products`
- `GET /storefront/:tenantSlug/fulfillment/options`

### Category page

Typical call:

- `GET /storefront/:tenantSlug/categories/:categorySlug`

Use this to render:

- category name and description
- products in that category
- pagination controls

### Product detail page

Typical call:

- `GET /storefront/:tenantSlug/products/:productSlug`

Use this to render:

- product name
- description
- price
- optional compare-at price
- variants
- media reference
- attributes

### Checkout page

Typical flow:

1. load fulfillment options
2. collect customer details
3. create order
4. if gateway payment is selected, create payment intent

Calls:

- `GET /storefront/:tenantSlug/fulfillment/options`
- `POST /storefront/:tenantSlug/orders`
- `POST /storefront/:tenantSlug/payments/intents`

## Catalog Reads

### List categories

`GET /storefront/:tenantSlug/categories`

Use this for:

- nav menus
- collection landing pages
- category shelves

### List products

`GET /storefront/:tenantSlug/products`

Use this for:

- product grids
- landing pages
- featured product sections

### Get category with products

`GET /storefront/:tenantSlug/categories/:categorySlug`

Use this for:

- category pages
- filtered listing pages

### Get one product

`GET /storefront/:tenantSlug/products/:productSlug`

Use this for:

- product detail pages
- add-to-cart pages

## Fulfillment Options

Before checkout, the storefront should load:

- `GET /storefront/:tenantSlug/fulfillment/options`

This endpoint tells the frontend things like:

- whether pickup is enabled
- whether delivery is enabled
- which delivery zones are active
- delivery fees
- store open/closed state
- instructions the storefront should show to customers

Frontend implication:

- do not hardcode delivery options in the UI
- render from the fulfillment response

## Creating An Order

Use:

- `POST /storefront/:tenantSlug/orders`

Important behavior:

- the backend calculates totals authoritatively
- the backend validates items against live catalog data
- fulfillment is validated server-side
- stock is enforced server-side
- this endpoint requires idempotency

### Required idempotency header

```http
Idempotency-Key: <stable-client-key>
```

This is important for real-world frontend behavior because users may:

- double-click buttons
- refresh the page
- lose network connectivity
- retry a request after a timeout

The frontend should reuse the same idempotency key when retrying the same logical checkout submission.

### Example order request

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

### Example order response

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

## Creating A Payment Intent

If the order uses gateway payment, call:

- `POST /storefront/:tenantSlug/payments/intents`

Current implementation:

- Flutterwave Uganda Mobile Money

### Example request

```json
{
  "order_id": "8e352ac5-ff5a-4b22-b94b-d29620c13750",
  "customer_phone_e164": "+256712345678",
  "network": "MTN",
  "email": "shopper@example.com"
}
```

### Example response

The response includes an `intent` object and a `next_action`.

Current expected UI pattern:

- show a message like "Mobile money prompt initiated"
- keep polling or refreshing the order/payment status through your app workflow if you add a customer status screen later
- tell the user to complete the prompt on their phone

## What Storefront UIs Should Treat As Stable

For frontend rendering, these patterns are stable and safe to build around:

- list endpoints return paginated shapes
- public catalog reads return only public fields
- order creation returns canonical totals
- payment intent creation returns a normalized `intent` plus `next_action`

What you should not do:

- calculate final order totals only in the client and assume the backend will accept them
- assume inventory is merely advisory
- assume payment success happens immediately after intent creation

## Suggested Frontend Data Fetching Pattern

A practical storefront API client often looks like this:

```ts
const storefrontBase = (tenantSlug: string) => `/storefront/${tenantSlug}`;
```

Then build small functions:

```ts
async function getProducts(tenantSlug: string) {
  return fetchJson(`${storefrontBase(tenantSlug)}/products`);
}

async function createOrder(tenantSlug: string, body: CreateOrderBody, idempotencyKey: string) {
  return fetchJson(`${storefrontBase(tenantSlug)}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify(body)
  });
}
```

## Related Reference Docs

- [Storefront Catalog API](../api/public/storefront-catalog.md)
- [Storefront Fulfillment API](../api/public/storefront-fulfillment.md)
- [Storefront Orders API](../api/public/storefront-orders.md)
- [Storefront Payments API](../api/public/storefront-payments.md)
- [Public Catalog Sample Data](../testing/public-catalog-sample-data.md)
