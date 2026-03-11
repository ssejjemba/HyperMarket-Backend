import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import { OtpChallenge } from '../domain/OtpChallenge';
import type { OtpChallengeStatus } from '../domain/OtpChallenge';
import type { CreateChallengeInput, OtpChallengeRepository } from './OtpChallengeRepository';

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

const rowToChallenge = (row: DatabaseSchema['auth_otps']): OtpChallenge =>
  new OtpChallenge({
    id: row.id,
    phoneE164: row.phone_e164,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    status: row.status as OtpChallengeStatus,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at
  });

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createOtpChallengeRepoPg = (db: Kysely<DatabaseSchema>): OtpChallengeRepository => {
  const createChallenge = async (input: CreateChallengeInput): Promise<OtpChallenge> => {
    const row = await db
      .insertInto('auth_otps')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        phone_e164: input.phoneE164,
        code_hash: input.codeHash,
        expires_at: input.expiresAt,
        attempt_count: 0,
        max_attempts: input.maxAttempts,
        status: 'ACTIVE',
        last_sent_at: input.lastSentAt,
        created_at: sql`now()`
      })
      .returning([
        'id',
        'phone_e164',
        'code_hash',
        'expires_at',
        'attempt_count',
        'max_attempts',
        'status',
        'last_sent_at',
        'created_at'
      ])
      .executeTakeFirstOrThrow();

    return rowToChallenge(row);
  };

  const getChallengeById = async (id: string): Promise<OtpChallenge | null> => {
    const row = await db
      .selectFrom('auth_otps')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row !== undefined ? rowToChallenge(row) : null;
  };

  const updateChallenge = async (challenge: OtpChallenge): Promise<void> => {
    await db
      .updateTable('auth_otps')
      .set({
        attempt_count: challenge.attemptCount,
        status: challenge.status,
        last_sent_at: challenge.lastSentAt
      })
      .where('id', '=', challenge.id)
      .execute();
  };

  const countRecentChallengesForPhone = async (phoneE164: string, since: Date): Promise<number> => {
    const result = await db
      .selectFrom('auth_otps')
      .select(db.fn.countAll<number>().as('n'))
      .where('phone_e164', '=', phoneE164)
      .where('created_at', '>=', since)
      .executeTakeFirstOrThrow();

    return Number(result.n);
  };

  return { createChallenge, getChallengeById, updateChallenge, countRecentChallengesForPhone };
};
