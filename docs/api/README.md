# API Reference

- [Conventions](./conventions.md)
- [Authentication](./authentication.md)
- [Merchant API](./merchant/README.md)
- [Public Storefront API](./public/README.md)

All routes currently live in the API server under:

- [apps/api/src/server.ts](../../apps/api/src/server.ts)

Current API coverage:

- `IAA`: OTP auth and session routes
- `TEN`: tenants, memberships, and tenant settings
- `CAT`: merchant catalog CRUD and public storefront catalog reads
- `MED`: merchant media upload-token, confirm, list, and delete
- `ORD`: storefront checkout and merchant order management
- `PAY`: storefront payment intents and provider webhooks
- `PUB`: store config drafting, publish, and rollback
- `TMP`: template discovery for publishing
