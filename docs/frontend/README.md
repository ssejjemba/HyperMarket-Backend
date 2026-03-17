# Frontend Integration Guide

This section explains how a frontend application should consume the HyperMarket backend.

It is written for frontend engineers, not backend maintainers.

If you are building:

- a public storefront
- a merchant dashboard
- an internal operator tool

start here before reading the lower-level API reference.

## What This Guide Covers

- how the backend is organized from a frontend point of view
- how authentication works
- how tenant context works
- which API families exist
- how to build common user flows
- how to handle errors, retries, and idempotency
- what responses are stable enough to build UI around

## Recommended Reading Order

1. [Overview](./overview.md)
2. [Authentication and Tenant Context](./authentication-and-tenancy.md)
3. [Storefront Integration](./storefront.md)
4. [Merchant Dashboard Integration](./merchant-dashboard.md)
5. [Frontend API Patterns](./frontend-patterns.md)

## How This Differs From The API Reference

The API reference under [`docs/api`](../api/README.md) is endpoint-first.

This guide is flow-first.

That means:

- the API reference tells you what each route does
- this guide tells you which routes to call to build a page or user journey

## Main Backend Surfaces A Frontend Cares About

### Public storefront routes

These are used by customer-facing experiences such as:

- product listing pages
- product detail pages
- cart and checkout
- payment initiation

They live under:

- `/storefront/:tenantSlug/...`

### Merchant routes

These are used by authenticated merchant dashboards such as:

- tenant selection
- catalog management
- fulfillment setup
- media management
- order management
- publishing
- operator visibility

They live under:

- `/auth/...`
- `/tenants/:tenantId/...`

### Provider-facing webhook routes

These are not frontend routes, but frontend engineers usually need to know they exist so they understand why order/payment status may change asynchronously.

Current example:

- `/payments/webhooks/flutterwave`

## Quick Mental Model

If you only remember one thing, remember this:

- public storefront pages use `tenantSlug`
- merchant dashboard pages use `tenantId` plus an access token
- most backend writes are asynchronous-safe and may complete side effects later through the worker
- some flows, especially checkout and payments, require idempotent client behavior
