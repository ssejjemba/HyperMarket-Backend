# System Overview

HyperMarket Backend is a modular monolith for a multi-tenant commerce platform.

Core properties:

- Shared Postgres schema with strict tenant scoping
- Fastify HTTP API
- Kysely repositories
- Transactional outbox for side effects
- BullMQ worker for storefront revalidation delivery
- JWT-based merchant authentication

## Main Runtime Pieces

- API server: request handling, auth, business workflows
- Worker: outbox polling and storefront revalidation dispatch
- Postgres: transactional state and outbox persistence
- Redis: queue transport and OTP rate limiting

## Current Feature Areas

- Authentication via OTP request and verification
- Tenant creation, tenant settings, and tenant membership management
- Template-backed publishing flows
- Tenant-scoped catalog CRUD and public storefront reads

## Composition Root

Modules are registered from:

- [packages/modules/src/index.ts](../../packages/modules/src/index.ts)

The API server builds shared dependencies and injects them into module registration:

- [apps/api/src/server.ts](../../apps/api/src/server.ts)
