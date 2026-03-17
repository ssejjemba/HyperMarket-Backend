# Overview

This page gives a frontend engineer's view of the backend.

## The Backend Has Two Main Use Cases

### 1. Public storefront

This is the customer-facing side of the product.

Typical pages:

- home page
- category page
- product page
- checkout page
- payment step

Typical backend needs:

- load tenant-specific catalog data
- show fulfillment options
- create orders
- create payment intents

### 2. Merchant dashboard

This is the merchant-facing side of the product.

Typical screens:

- sign in
- choose tenant/store
- manage categories and products
- configure fulfillment
- upload media
- manage orders
- publish changes
- inspect operational issues

Typical backend needs:

- authenticate the merchant
- know which tenant the merchant is working in
- allow secure CRUD operations under that tenant

## Important Concepts

### Tenant

A tenant is a merchant/store account.

Nearly everything in the system belongs to a tenant.

Frontend implication:

- storefront requests usually identify the tenant by `tenantSlug`
- merchant requests usually identify the tenant by `tenantId`

### Tenant slug

This is the public-friendly identifier used in storefront routes.

Example:

```text
/storefront/sunrise-fresh/products
```

Here, `sunrise-fresh` is the tenant slug.

### Tenant ID

This is the UUID used in authenticated merchant APIs.

Example:

```text
/tenants/4bc73e5f-288f-4be3-9f91-3cefb8c5401b/products
```

### Merchant auth token

After OTP verification, the merchant frontend receives a bearer token.

That token is sent on authenticated merchant requests using:

```http
Authorization: Bearer <access_token>
```

### Public vs merchant data

The backend intentionally exposes different shapes for public and merchant use cases.

For example:

- storefront product reads return only public-safe fields
- merchant catalog routes return management fields needed for editing

Frontend implication:

- do not assume the storefront response and merchant response for the same business entity have the same shape

## API Families

These are the API families a frontend will commonly touch.

### Auth

Used by the merchant dashboard.

Docs:

- [Authentication](../api/authentication.md)

### Merchant APIs

Used by the dashboard after login.

Docs:

- [Merchant API Index](../api/merchant/README.md)

### Public storefront APIs

Used by customer-facing storefront pages.

Docs:

- [Public Storefront API Index](../api/public/README.md)

## Async Behavior Matters

Frontend engineers should know that not everything happens synchronously.

Examples:

- notifications are sent by background workers
- storefront revalidation is queued
- payment status may change after a provider webhook arrives

Frontend implication:

- some UI states should be treated as "pending"
- an order can exist before a payment is marked paid
- dashboard screens should be able to refresh status instead of assuming the first response is the final state forever

## Suggested Integration Strategy

For most frontend projects, the cleanest approach is:

1. build a small API client layer
2. separate public and authenticated clients
3. model `tenantSlug` and `tenantId` separately
4. centralize error handling
5. centralize idempotency key generation for checkout/payment actions

That pattern is expanded in:

- [Frontend API Patterns](./frontend-patterns.md)
