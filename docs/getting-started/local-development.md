# Local Development

## Prerequisites

- Node.js `>=24`
- `pnpm` via Corepack
- Docker

## First Run

1. Install dependencies.

```bash
corepack pnpm install
```

2. Copy environment values if you want a local `.env`.

```bash
cp .env.example .env
```

3. Start Postgres and Redis.

```bash
corepack pnpm db:up
```

4. Run migrations.

```bash
corepack pnpm db:migrate
```

5. Start the API.

```bash
corepack pnpm dev:api
```

6. Start the worker in a second terminal.

```bash
corepack pnpm dev:worker
```

## Useful Commands

```bash
corepack pnpm test
corepack pnpm test:integration
corepack pnpm typecheck
corepack pnpm db:reset
corepack pnpm db:down
```

## What Runs Where

- API server: [apps/api/src/server.ts](../../apps/api/src/server.ts)
- Worker: [apps/worker/src/worker.ts](../../apps/worker/src/worker.ts)
- Migrations: [packages/core/db/migrations](../../packages/core/db/migrations)
- Module composition: [packages/modules/src/index.ts](../../packages/modules/src/index.ts)
