import { describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createIdempotencyService } from '@hypermarket/core/idempotency';

const operation = 'order:create';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('idempotency', () => {
  it('replays with same key and hash', async () => {
    const context = await createTestContext();
    const service = createIdempotencyService();

    const result = await context.db.transaction().execute(async (trx) => {
      return service.begin(trx, context.seed.tenantId, operation, 'key-1', 'hash-1');
    });

    expect(result.status).toBe('created');

    const replay = await context.db.transaction().execute(async (trx) => {
      return service.begin(trx, context.seed.tenantId, operation, 'key-1', 'hash-1');
    });

    expect(replay.status).toBe('replay');

    await context.destroy();
  });

  it('rejects key reuse with different hash', async () => {
    const context = await createTestContext();
    const service = createIdempotencyService();

    await context.db.transaction().execute(async (trx) => {
      return service.begin(trx, context.seed.tenantId, operation, 'key-2', 'hash-1');
    });

    await expect(
      context.db
        .transaction()
        .execute(async (trx) =>
          service.begin(trx, context.seed.tenantId, operation, 'key-2', 'hash-2')
        )
    ).rejects.toThrow('Idempotency key reuse conflict');

    await context.destroy();
  });
});
