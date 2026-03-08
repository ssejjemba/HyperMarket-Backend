import { type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from './client';

type DbContext = {
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
};

export const runInTransaction = async <T>(
  db: Kysely<DatabaseSchema>,
  fn: (_trx: Transaction<DatabaseSchema>) => Promise<T>
): Promise<T> => {
  return db.transaction().execute(async (trx) => fn(trx));
};

export const withTx = async <T>(
  ctx: DbContext,
  fn: (_trx: Transaction<DatabaseSchema>) => Promise<T>
): Promise<T> => {
  if (ctx.db instanceof Kysely) {
    return runInTransaction(ctx.db, fn);
  }

  return fn(ctx.db);
};
