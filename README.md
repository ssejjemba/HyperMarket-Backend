# HyperMarket Backend

HyperMarket Backend is a TypeScript monorepo for a multi-tenant commerce platform.

It runs as a modular monolith:

- one HTTP API
- one background worker
- shared infrastructure and contracts packages
- business modules that own their own routes, domain logic, persistence, and tests

This repository already implements real product flows, not just scaffolding. Today it includes:

- merchant authentication and tenant access
- catalog management
- fulfillment settings and delivery zones
- storefront checkout and strict stock enforcement
- payments and webhook processing
- media asset upload metadata
- notification scheduling and delivery
- publishing and storefront revalidation
- authenticated operator tooling and queue recovery helpers

If you are new to the tools used here, this README is written to take you from zero to comfortable. It explains not only what to run, but what the tools are doing and why they are here.

## Table of Contents

- [What This Repository Is](#what-this-repository-is)
- [What You Need Before You Start](#what-you-need-before-you-start)
- [First-Time Setup](#first-time-setup)
- [How To Run The System](#how-to-run-the-system)
- [How To Verify Your Setup](#how-to-verify-your-setup)
- [How To Navigate The Repository](#how-to-navigate-the-repository)
- [Workspace Packages And Runtime Apps](#workspace-packages-and-runtime-apps)
- [Implemented Product Modules](#implemented-product-modules)
- [Common Commands](#common-commands)
- [Environment Variables](#environment-variables)
- [How Development Works In This Repo](#how-development-works-in-this-repo)
- [How To Add A New Module](#how-to-add-a-new-module)
- [How To Add Shared Or Common Code](#how-to-add-shared-or-common-code)
- [How To Test Changes](#how-to-test-changes)
- [Operations And Production Notes](#operations-and-production-notes)
- [Troubleshooting](#troubleshooting)
- [Where To Read Next](#where-to-read-next)

## What This Repository Is

This backend powers a tenant-scoped commerce platform.

That means one deployed system can serve many merchants safely, because merchant-owned data is partitioned by `tenant_id` and public storefront reads are resolved by tenant slug or domain.

At runtime there are two main processes:

- `API`
  Handles HTTP requests from dashboards, storefronts, provider webhooks, health checks, metrics scrapes, and authenticated operator endpoints.
- `Worker`
  Handles asynchronous work such as outbox processing, notification dispatch, storefront revalidation, dead-letter queue recovery, and payment reconciliation.

The repository is a monorepo. A monorepo is a single Git repository that contains multiple applications and packages that are developed together. In this codebase, that keeps contracts, infrastructure, and modules in one place so changes can stay consistent across the system.

## What You Need Before You Start

This section assumes you may not be familiar with the toolchain.

### Node.js

You need Node.js installed.

Required version:

- `Node.js >= 24`

Check your version:

```bash
node --version
```

If the version is lower than `24`, upgrade Node before going further.

### Corepack

This repository uses `pnpm` as its package manager, but you do not need to install `pnpm` globally by hand.

`corepack` is a tool bundled with modern Node.js that can download and use the exact package manager version declared by the repo.

Enable it once on your machine:

```bash
corepack enable
```

After that, you can use commands like:

```bash
corepack pnpm install
```

### pnpm

`pnpm` is the package manager for this repo.

If you have used `npm` or `yarn` before, the idea is the same:

- it installs dependencies
- it runs scripts
- it manages workspace packages

This repository pins:

- `pnpm@10.31.0`

Using `corepack pnpm ...` ensures you run the version the repo expects.

### Git

You need Git to clone the repository and work with branches and commits.

Check:

```bash
git --version
```

### Docker

For local development, the easiest way to run infrastructure is Docker.

You need one of these:

- Docker Desktop
- Docker Engine with the Docker Compose plugin

Check:

```bash
docker --version
docker compose version
```

### PostgreSQL and Redis

The backend depends on:

- PostgreSQL for primary data storage
- Redis for queues, rate limiting, and some operational flows

You usually do not install these directly for local development because the repo can start them through Docker.

## First-Time Setup

This is the recommended path if this is your first time running the repo.

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd HyperMarket-Backend
```

### 2. Enable Corepack

```bash
corepack enable
```

You only need to do this once per machine in most cases.

### 3. Install dependencies

```bash
corepack pnpm install
```

This does a few important things:

- installs workspace dependencies
- links local packages together
- runs the repo `prepare` script, which sets up Husky Git hooks

### 4. Create your local environment file

Copy the example environment file:

```bash
cp .env.example .env
```

The main sources of truth for configuration are:

- [.env.example](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/.env.example)
- [loadEnv.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/core/src/config/loadEnv.ts)

`.env.example` gives you the expected variables and development defaults. `loadEnv.ts` defines what is required, what is optional, and what feature combinations are valid.

If you are just getting started locally, the example file is the correct place to begin.

### 5. Start local infrastructure

```bash
corepack pnpm db:up
```

This uses Docker Compose to start local infrastructure services from the repo's Docker configuration.

To stop them later:

```bash
corepack pnpm db:down
```

### 6. Run database migrations

```bash
corepack pnpm db:migrate
```

This applies the schema changes under `packages/core/db/migrations` to your local Postgres database.

If you need to rebuild your local database from scratch:

```bash
corepack pnpm db:reset
```

Use `db:reset` carefully. It is intended for local development only and destroys current local schema state.

### 7. Start the API

Open one terminal and run:

```bash
corepack pnpm dev:api
```

This starts the API application from [server.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/apps/api/src/server.ts).

### 8. Start the worker

Open a second terminal and run:

```bash
corepack pnpm dev:worker
```

This starts the background worker from [worker.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/apps/worker/src/worker.ts).

### 9. Run the live smoke test

Once API, worker, Postgres, and Redis are up, run:

```bash
corepack pnpm smoke:storefront
```

This is not just a unit test. It starts from real runtime assumptions and exercises live backend behavior with seeded data to prove that the local system can answer storefront requests and create an order successfully.

## How To Run The System

The main local development commands are:

### Start infrastructure

```bash
corepack pnpm db:up
```

### Run database migrations

```bash
corepack pnpm db:migrate
```

### Start the API

```bash
corepack pnpm dev:api
```

### Start the worker

```bash
corepack pnpm dev:worker
```

### Stop infrastructure

```bash
corepack pnpm db:down
```

In development, you will normally keep two terminals open:

- one for the API
- one for the worker

## How To Verify Your Setup

There are several levels of verification in this repo.

### 1. Basic HTTP health checks

With the API running, check:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

Examples:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

`/health/live` answers whether the process is alive.

`/health/ready` answers whether critical dependencies are ready for traffic. Right now that includes:

- database connectivity
- Redis connectivity

### 2. Metrics endpoints

The API exposes:

- `GET /metrics`

The worker exposes a metrics server controlled by env vars in `.env.example`. The default development values expose worker metrics on a separate port, which is useful for local troubleshooting and production scraping.

### 3. Live storefront smoke test

Run:

```bash
corepack pnpm smoke:storefront
```

This is the best single command to confirm the backend is basically healthy for local development.

### 4. Type checking and tests

Run:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
```

If you are changing a narrow area, you can run targeted tests instead, but for first-time setup the full scripts are the simplest sanity check.

## How To Navigate The Repository

This is the top-level layout you will use most often:

- `apps/`
  Runtime applications.
- `packages/`
  Shared code and product modules.
- `docs/`
  Repository documentation.
- `tests/`
  Cross-package tests, smoke coverage, route tests, and integration tests.
- `scripts/`
  Helper scripts for smoke checks and operational tooling.
- `docker/`
  Local infrastructure definitions.

If you are trying to understand the system quickly, start here:

1. [README.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/README.md)
2. [docs/README.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/README.md)
3. [modules.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/architecture/modules.md)
4. [data-flow.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/architecture/data-flow.md)
5. `apps/api/src/server.ts`
6. `apps/worker/src/worker.ts`

## Workspace Packages And Runtime Apps

### `apps/api`

The API application.

It is responsible for:

- public storefront routes
- merchant dashboard routes
- webhook endpoints
- authenticated ops routes
- health and readiness endpoints
- API metrics

Main entrypoint:

- [server.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/apps/api/src/server.ts)

### `apps/worker`

The worker application.

It is responsible for:

- consuming outbox side effects
- notification dispatch
- storefront revalidation queue processing
- dead-letter queue operations
- payment reconciliation
- worker metrics

Main entrypoint:

- [worker.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/apps/worker/src/worker.ts)

### `packages/core`

Shared infrastructure and foundations.

This package includes things such as:

- config loading
- database client and migrations
- idempotency helpers
- outbox helpers
- audit helpers
- logger and metrics utilities
- testkit support

If code is cross-cutting and not specific to one product module, this is the first place to consider.

### `packages/contracts`

Shared contracts used across apps and modules.

This package includes:

- stable error codes
- shared error mapping
- API-facing error shapes

Use this package for shared contracts, not for business logic.

### `packages/modules`

Business modules live here.

Each module should own:

- route registration
- request validation
- domain rules
- persistence
- internal interfaces/ports
- module-specific tests

Current route-bearing modules are registered from:

- [index.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/modules/src/index.ts)

## Implemented Product Modules

The repository currently contains these implemented product modules:

- `IAA`
  Identity and access.
- `TEN`
  Tenancy, membership, and tenant settings.
- `TMP`
  Template registry and template-facing support.
- `CAT`
  Catalog data for categories, products, variants, and storefront reads.
- `FUL`
  Fulfillment settings, delivery zones, business-hours gating, and fee calculation.
- `MED`
  Media asset metadata and upload confirmation flow.
- `ORD`
  Order creation, totals, snapshots, state transitions, and strict stock enforcement.
- `PAY`
  Payment intents, Flutterwave integration, webhook verification, and reconciliation.
- `NOT`
  Notification planning, scheduling, rendering, provider dispatch, retries, and DLQ behavior.
- `PUB`
  Publishing and storefront revalidation flows.
- `OPS`
  Authenticated operator visibility and recovery endpoints.

## Common Commands

These are the commands you will use most often.

### Install dependencies

```bash
corepack pnpm install
```

### Run the API

```bash
corepack pnpm dev:api
```

### Run the worker

```bash
corepack pnpm dev:worker
```

### Type-check the repo

```bash
corepack pnpm typecheck
```

### Run all tests

```bash
corepack pnpm test
```

### Run integration tests

```bash
corepack pnpm test:integration
```

### Run live smoke verification

```bash
corepack pnpm smoke:storefront
```

### Start local infrastructure

```bash
corepack pnpm db:up
```

### Stop local infrastructure

```bash
corepack pnpm db:down
```

### Run migrations

```bash
corepack pnpm db:migrate
```

### Roll back the latest migration

```bash
corepack pnpm db:rollback
```

### Reset the local database

```bash
corepack pnpm db:reset
```

### Inspect runtime and DLQs

```bash
corepack pnpm ops:status
corepack pnpm ops:dlq:list notifications 10
corepack pnpm ops:dlq:list revalidation 10
```

### Replay a DLQ job

```bash
corepack pnpm ops:dlq:replay notifications <jobId>
corepack pnpm ops:dlq:replay revalidation <jobId>
```

## Environment Variables

Do not try to memorize the environment variables from this README alone.

The actual source of truth is:

- [.env.example](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/.env.example)
- [environment.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/getting-started/environment.md)
- [loadEnv.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/core/src/config/loadEnv.ts)

At a high level, the environment is grouped like this:

- core runtime
  - `NODE_ENV`
  - `PORT`
  - `DATABASE_URL`
  - `REDIS_URL`
- auth and tokens
  - JWT and session-related variables
- provider integrations
  - Twilio
  - Flutterwave
- notification defaults
  - default provider/channel and sender values
- rate limiting
  - storefront rate-limit controls
- worker metrics
  - host and port for the worker metrics server

When you add new configuration, update all three places:

1. `.env.example`
2. `loadEnv.ts`
3. `docs/getting-started/environment.md`

## How Development Works In This Repo

There are a few repo conventions worth understanding early.

### Modules own their business logic

Domain logic should live in the module that owns the business concept.

Examples:

- order state transitions belong in `ORD`
- payment provider behavior belongs in `PAY`
- delivery-fee rules belong in `FUL`
- product visibility rules belong in `CAT`

Avoid re-implementing another module's rules in your own code. If one module needs another module's behavior, prefer an interface or port instead of bypassing the boundary.

### Shared infrastructure belongs in `packages/core`

If something is generic and cross-cutting, it probably belongs in `packages/core`.

Examples:

- logging helpers
- database utilities
- outbox helpers
- idempotency helpers
- metrics registry

### Shared contracts belong in `packages/contracts`

If multiple apps or modules need the same error code, response shape, or shared contract, place it in `packages/contracts`.

### Migrations are part of the feature

If your change adds persistence, it is not complete without:

- a migration
- schema typing updates
- tests that prove the new persistence works

### Background side effects should use the outbox

If a business action should trigger asynchronous work, do not directly call the worker or external provider from the request path unless there is a strong reason.

Use:

- DB transaction for the main write
- outbox record for the side effect
- worker processing for delivery

This keeps side effects reliable under retries and failures.

## How To Add A New Module

If you are adding a new business module, use this flow.

### 1. Define the module boundary first

Write down:

- what the module owns
- what it depends on
- what tables it needs
- what public or merchant routes it exposes
- what outbox events it emits
- what other modules are allowed to call it

If you skip this step, the code will drift into cross-module leakage quickly.

### 2. Create the module folder

Create a new folder under:

- `packages/modules/src/<module-name>`

Follow the existing style used by current modules. The exact subfolders vary by module, but the common pattern is:

- `api/`
- `application/`
- `domain/`
- `persistence/`
- `observability/`

Not every module needs all of them, but route handlers, domain rules, and persistence should not be mixed together without reason.

### 3. Add error codes if needed

If the module introduces new stable errors, add them in:

- [errorCodes.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/contracts/src/errors/errorCodes.ts)

If the HTTP mapping needs adjustment, update:

- [errorToHttp.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/contracts/src/errors/errorToHttp.ts)

### 4. Add persistence

If the module stores data:

- create a migration in `packages/core/db/migrations`
- update the DB schema typing used by the Kysely client
- add integration coverage for constraints and tenant scoping

### 5. Register routes

If the module exposes API routes:

- create a module entrypoint that exports a `register...Routes` function
- wire it into [packages/modules/src/index.ts](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/packages/modules/src/index.ts)

If the module is internal only, do not register HTTP routes just because the folder exists.

### 6. Add tests

At minimum, add:

- unit tests for pure domain logic
- integration tests for persistence rules
- route tests for API behavior if routes exist

### 7. Add documentation

Update:

- root `README.md` if the repo surface changed materially
- relevant docs under `docs/architecture`, `docs/api`, `docs/reference`, or `docs/operations`

### 8. Wire operational behavior

If the module emits events, uses queues, or adds runtime dependencies, update:

- smoke checks if needed
- metrics if needed
- operational docs if needed

## How To Add Shared Or Common Code

Shared code is useful, but it is also where monorepos become messy if boundaries are weak.

Use these rules.

### Put code in `packages/core` when it is infrastructure

Good examples:

- config loaders
- DB helpers
- queue helpers
- logger wrappers
- idempotency utilities
- metrics primitives

### Put code in `packages/contracts` when it is a shared contract

Good examples:

- error codes
- typed shared DTO contracts
- API error shapes

### Keep domain logic inside the owning module

Bad shared-code candidates:

- catalog pricing logic
- payment transition rules
- fulfillment fee rules
- order totals logic

Those should stay in their owning modules because they are business rules, not generic infrastructure.

### Prefer a module port over a shared helper when crossing boundaries

If `PAY` needs to ask `ORD` to transition an order, the correct answer is usually an interface or module boundary, not a shared helper in `packages/core`.

## How To Test Changes

The repo uses several layers of testing.

### Type checking

```bash
corepack pnpm typecheck
```

This validates TypeScript correctness across the workspace.

### Unit and route tests

```bash
corepack pnpm test
```

This runs the standard Vitest suite.

### Integration tests

```bash
corepack pnpm test:integration
```

Use this when your change touches:

- database behavior
- tenant scoping
- transactions
- outbox flows

### Live smoke checks

```bash
corepack pnpm smoke:storefront
```

This is especially useful after changes affecting:

- storefront routes
- checkout
- payments
- fulfillment
- runtime startup behavior

### What to run before you commit

For most meaningful backend changes, the minimum bar should be:

```bash
corepack pnpm typecheck
corepack pnpm test
```

If your change touched persistence, runtime startup, worker behavior, storefront flows, or external-provider handling, also run:

```bash
corepack pnpm test:integration
corepack pnpm smoke:storefront
```

## Operations And Production Notes

This repo already includes some operator-oriented tooling.

### Health and readiness

API:

- `/health`
- `/health/live`
- `/health/ready`
- `/metrics`

Worker:

- worker metrics server controlled by env vars
- `/health/live`
- `/metrics`

### CLI operational helpers

Use:

```bash
corepack pnpm ops:status
corepack pnpm ops:dlq:list notifications 10
corepack pnpm ops:dlq:list revalidation 10
corepack pnpm ops:dlq:replay notifications <jobId>
```

### Authenticated operator endpoints

The repo also exposes authenticated ops endpoints intended for later frontend tooling. Read the docs in:

- [operations.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/api/merchant/operations.md)

### More operations docs

Start here:

- [docs/operations/README.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/operations/README.md)
- [runtime-readiness.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/operations/runtime-readiness.md)
- [notifications.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/operations/notifications.md)
- [outbox-and-revalidation.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/operations/outbox-and-revalidation.md)
- [recovery-tooling.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/operations/recovery-tooling.md)

## Troubleshooting

### `pnpm` command not found

Use:

```bash
corepack enable
corepack pnpm --version
```

If that still fails, your Node installation may be too old or incomplete.

### Docker is running but the app still cannot connect to Postgres or Redis

Check:

```bash
docker compose ps
```

Then verify your `.env` values match the ports your local containers expose.

Also check:

```bash
curl http://127.0.0.1:3000/health/ready
```

### Migrations fail on a messy local database

If your local DB contains stale development data and you do not need to preserve it, use:

```bash
corepack pnpm db:reset
corepack pnpm db:migrate
```

Do not do this against shared or production environments.

### Worker is running but background jobs are not moving

Check:

- Redis connectivity
- worker logs
- `corepack pnpm ops:status`
- worker `/metrics`

### You are not sure where a feature belongs

Use this rule:

- business rule -> owning module
- shared infrastructure -> `packages/core`
- shared contract -> `packages/contracts`

If you still cannot decide, read:

- [modules.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/architecture/modules.md)

## Where To Read Next

Once you are comfortable with this README, continue here:

- [docs/README.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/README.md)
- [docs/architecture/modules.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/architecture/modules.md)
- [docs/architecture/data-flow.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/architecture/data-flow.md)
- [docs/api/README.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/api/README.md)
- [docs/reference/database-schema.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/reference/database-schema.md)
- [docs/reference/error-codes.md](/Users/danielssejjemba/Desktop/work/HyperMarket-Backend/docs/reference/error-codes.md)

If you need one very short mental model, use this:

- `apps/api` receives and validates requests
- modules own business behavior
- `packages/core` provides infrastructure
- `packages/contracts` provides shared contracts
- `apps/worker` processes asynchronous side effects
- `docs/` explains the system in more detail
