# HyperMarket Backend Docs

This directory documents the backend as it exists in the repository today.

Start here:

- [Getting Started](./getting-started/README.md)
- [Frontend Integration Guide](./frontend/README.md)
- [Architecture](./architecture/README.md)
- [API Reference](./api/README.md)
- [Reference](./reference/README.md)
- [Testing Fixtures](./testing/README.md)
- [Operations](./operations/README.md)

Current implemented modules:

- `IAA` identity and access
- `TEN` tenancy and tenant settings
- `CAT` catalog
- `MED` media assets and upload flow
- `ORD` orders and merchant order management
- `PAY` payment intents, webhooks, and reconciliation
- `NOT` notification scheduling and dispatch
- `PUB` publishing and storefront revalidation
- `TMP` template registry

If you only need the storefront catalog API, go directly to:

- [Storefront Catalog API](./api/public/storefront-catalog.md)
- [Public Catalog Sample Data](./testing/public-catalog-sample-data.md)

If you need checkout and payment flows, start here:

- [Storefront Orders API](./api/public/storefront-orders.md)
- [Storefront Payments API](./api/public/storefront-payments.md)
