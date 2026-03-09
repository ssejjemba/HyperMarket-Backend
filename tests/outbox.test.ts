import { describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createOutboxWriter } from '@hypermarket/core/outbox';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('outbox writer', () => {
  it('writes outbox events inside transaction', async () => {
    const context = await createTestContext();
    const writer = createOutboxWriter();

    const record = await context.db.transaction().execute(async (trx) => {
      return writer.write(trx, {
        eventType: 'Test.Event',
        tenantId: context.seed.tenantId,
        correlationId: '00000000-0000-0000-0000-000000000100',
        actorUserId: context.seed.userId,
        payload: { hello: 'world' }
      });
    });

    expect(record.eventType).toBe('Test.Event');

    const rows = await context.db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('id', '=', record.id)
      .execute();

    expect(rows.length).toBe(1);

    await context.destroy();
  });
});
