import { describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createIdempotencyService } from '@hypermarket/core/idempotency';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('webhook idempotency', () => {
  it('returns same responseRef on replay', async () => {
    const context = await createTestContext();
    const service = createIdempotencyService();

    const begin = await context.db.transaction().execute(async (trx) => {
      return service.begin(trx, context.seed.tenantId, 'webhook:stripe', 'evt_1', 'hash-1');
    });

    await context.db.transaction().execute(async (trx) => {
      await service.complete(trx, begin.record.id, 'payments/evt_1');
    });

    const replay = await context.db.transaction().execute(async (trx) => {
      return service.begin(trx, context.seed.tenantId, 'webhook:stripe', 'evt_1', 'hash-1');
    });

    expect(replay.status).toBe('replay');
    expect(replay.record.responseRef).toBe('payments/evt_1');

    await context.destroy();
  });
});
