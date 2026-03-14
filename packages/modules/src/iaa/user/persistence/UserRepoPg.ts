import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import { UserIdentity } from '../domain/UserIdentity';
import type { UserStatus } from '../domain/UserIdentity';
import type { UserRepository } from './UserRepository';

// ---------------------------------------------------------------------------
// Row → domain mapping
// ---------------------------------------------------------------------------

type UserRow = DatabaseSchema['users'];

const rowToIdentity = (row: UserRow): UserIdentity =>
  new UserIdentity({
    id: row.id,
    phoneE164: row.phone_e164,
    status: row.is_active ? 'active' : ('suspended' as UserStatus),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const createUserRepoPg = (db: Kysely<DatabaseSchema>): UserRepository => ({
  async findByPhone(phoneE164: string): Promise<UserIdentity | null> {
    const row = await db
      .selectFrom('users')
      .selectAll()
      .where('phone_e164', '=', phoneE164)
      .executeTakeFirst();

    return row !== undefined ? rowToIdentity(row) : null;
  },

  async createWithPhone(phoneE164: string): Promise<UserIdentity> {
    const row = await db
      .insertInto('users')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        phone_e164: phoneE164,
        email: null,
        is_active: true,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return rowToIdentity(row);
  }
});
