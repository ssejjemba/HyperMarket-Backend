import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { SessionRecord, SessionRepository } from './SessionRepository';

type DbExecutor = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

const rowToSession = (row: DatabaseSchema['sessions']): SessionRecord => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at
});

export const createSessionRepoPg = (db: DbExecutor): SessionRepository => ({
  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    const row = await db
      .insertInto('sessions')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return rowToSession(row);
  },

  async getSessionById(sessionId: string): Promise<SessionRecord | null> {
    const row = await db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();

    return row !== undefined ? rowToSession(row) : null;
  },

  async revokeSession(sessionId: string): Promise<void> {
    await db
      .updateTable('sessions')
      .set({
        revoked_at: sql`coalesce(revoked_at, now())`
      })
      .where('id', '=', sessionId)
      .execute();
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await db
      .updateTable('sessions')
      .set({
        revoked_at: sql`coalesce(revoked_at, now())`
      })
      .where('user_id', '=', userId)
      .execute();
  }
});
