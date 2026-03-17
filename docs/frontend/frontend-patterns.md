# Frontend API Patterns

This page focuses on practical patterns that make frontend integration easier and safer.

## Separate Public And Authenticated API Clients

Do not use one catch-all client for everything.

Recommended split:

- `storefrontClient`
  - no merchant auth token
  - keyed by `tenantSlug`
- `dashboardClient`
  - always sends bearer token
  - keyed by `tenantId`

This keeps your code easier to reason about.

## Normalize Error Handling

Backend errors include stable error codes.

Frontend implication:

- build your error UI around `error_code`, not only raw text messages
- keep a small frontend map for user-facing copy

Example strategy:

```ts
const errorMessages: Record<string, string> = {
  order_product_not_found: 'One of the selected products is no longer available.',
  order_quantity_invalid: 'Please choose a valid quantity.',
  payment_order_not_payable: 'This order cannot be paid right now.'
};
```

Then:

```ts
function getApiErrorMessage(errorCode?: string) {
  return errorCode
    ? (errorMessages[errorCode] ?? 'Something went wrong.')
    : 'Something went wrong.';
}
```

## Use Idempotency For Write Actions That Need It

Two storefront write flows require especially careful client behavior:

- create order
- create payment intent

Both support idempotency through:

```http
Idempotency-Key: <key>
```

### Why this matters

Users do not behave like perfect test scripts.

They:

- click twice
- retry after a spinner hangs
- go offline and come back
- reload the page

If the frontend sends a fresh idempotency key on every retry of the same logical action, the backend may correctly treat those as different operations.

### Good rule

Generate one key per logical user action and reuse it for retries of that same action.

Examples:

- one checkout submission -> one idempotency key
- one payment-intent initiation -> one idempotency key

## Treat Checkout Totals As Server-Owned

The frontend can show estimated totals, but the backend is the source of truth.

Frontend implication:

- never assume the final total is what the browser calculated earlier
- always trust the order response totals

This matters because the backend applies:

- authoritative product pricing
- fulfillment fee rules
- stock validation
- delivery zone rules

## Expect Async Status Changes

Some important states can change after the first response.

Examples:

- a payment intent may move from `AWAITING_CUSTOMER` to `SUCCEEDED` later
- an order may move because of payment confirmation or merchant action
- notifications and revalidation happen in the background

Frontend implication:

- some screens should support refetching
- success UI should distinguish between "request accepted" and "final business outcome"

## Be Careful With Caching

Good caching candidates:

- public catalog reads
- fulfillment options
- template-driven static configuration reads

Be more careful with:

- order status
- payment status
- merchant operational views

A simple rule:

- cache public reads more aggressively
- refetch mutable operational data more frequently

## Reset State On Tenant Change

For dashboard apps, tenant switching is a major context change.

When the merchant changes tenant:

- clear resource caches for the old tenant
- reset selected resources like product/order IDs
- rebuild any route state derived from the old tenant

Do not allow old tenant data to remain visible in the new tenant context.

## Suggested Folder Structure In A Frontend App

One workable pattern:

```text
src/
  api/
    storefront/
    dashboard/
    auth/
  features/
    catalog/
    checkout/
    fulfillment/
    orders/
    publishing/
  state/
    auth/
    tenant/
```

This is not required, but the important idea is to separate:

- auth concerns
- public storefront concerns
- dashboard concerns

## Recommended First Screens To Build

If you are standing up a frontend from scratch, this order is practical:

### Storefront

1. category list
2. product listing
3. product detail
4. fulfillment options
5. order creation
6. payment intent creation

### Dashboard

1. OTP login
2. tenant selection
3. catalog list views
4. catalog forms
5. fulfillment settings
6. media upload flow
7. orders list and detail

## Related Reference Docs

- [API Conventions](../api/conventions.md)
- [Error Codes](../reference/error-codes.md)
- [Storefront Orders API](../api/public/storefront-orders.md)
- [Storefront Payments API](../api/public/storefront-payments.md)
