# Merchant Dashboard Integration

This page explains how a dashboard frontend should consume the authenticated merchant APIs.

## Merchant Route Pattern

Most merchant routes use this pattern:

```text
/tenants/:tenantId/...
```

And require:

```http
Authorization: Bearer <access_token>
```

## Common Merchant Areas

### Tenant setup and switching

Use auth plus tenancy APIs to:

- discover memberships
- select the active tenant
- load tenant-level settings

### Catalog management

Use the catalog APIs to:

- create categories
- edit categories
- create products
- edit products
- assign products to categories
- control visibility and ordering

### Fulfillment setup

Use fulfillment APIs to:

- enable pickup and delivery
- set pickup and delivery instructions
- define business hours
- create and manage delivery zones

### Media

Use media APIs to:

- request an upload token
- upload directly to storage
- confirm the upload
- list assets
- delete assets

Important frontend note:

- the backend does not accept raw file bytes through a normal multipart backend route in MVP
- uploads are direct-to-storage using a presigned upload flow

### Orders

Use order APIs to:

- list orders
- inspect a single order
- transition order state

### Publishing

Use publishing APIs to:

- update storefront config
- publish changes
- roll back when supported by the publishing flow

### Ops and troubleshooting

Use ops APIs to:

- view runtime summaries
- inspect outbox state
- inspect notifications
- inspect payments
- inspect DLQs
- replay DLQ jobs when authorized

## Recommended Dashboard API Client Shape

A good dashboard client usually has:

- one auth-aware HTTP client
- one current `tenantId` in app state
- resource helpers grouped by area

Example:

```ts
type DashboardApiContext = {
  accessToken: string;
  tenantId: string;
};
```

Then:

```ts
const tenantBase = (tenantId: string) => `/tenants/${tenantId}`;
```

And:

```ts
async function listProducts(ctx: DashboardApiContext) {
  return fetchJson(`${tenantBase(ctx.tenantId)}/products`, {
    headers: {
      authorization: `Bearer ${ctx.accessToken}`
    }
  });
}
```

## Important Dashboard Behaviors

### Tenant scoping is strict

If the frontend uses the wrong `tenantId`, the backend will not silently switch tenants for you.

Frontend implication:

- keep the selected tenant explicit
- show it clearly in the UI
- reset caches when the merchant switches tenants

### Some mutations are role-sensitive

Not every authenticated merchant can perform every action.

Examples:

- destructive actions
- some operational replay actions

Frontend implication:

- build permission-aware UI where possible
- be prepared to handle forbidden responses cleanly

### Backend writes may trigger async work

Examples:

- publishing triggers revalidation
- payments are reconciled later
- notifications dispatch asynchronously

Frontend implication:

- do not assume a mutation means every downstream side effect is already complete
- some screens should show "queued", "processing", or recently updated states

## Media Upload Flow From A Frontend Perspective

The media flow is important because it is different from a simple form POST.

Typical flow:

1. dashboard asks backend for an upload token
2. backend returns `asset_id`, `storage_key`, `upload_url`, and headers
3. frontend uploads the file directly to object storage
4. frontend calls confirm
5. backend marks the asset confirmed and returns the public asset DTO

Frontend implication:

- your upload UI should handle two steps, not one
- you should surface upload errors separately from confirm errors

## Related Reference Docs

- [Merchant API Index](../api/merchant/README.md)
- [Tenancy API](../api/merchant/tenancy.md)
- [Catalog API](../api/merchant/catalog.md)
- [Fulfillment API](../api/merchant/fulfillment.md)
- [Media API](../api/merchant/media.md)
- [Orders API](../api/merchant/orders.md)
- [Publishing API](../api/merchant/publishing.md)
- [Operations API](../api/merchant/operations.md)
