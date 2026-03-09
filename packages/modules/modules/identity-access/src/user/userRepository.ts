import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type UserRecord = {
  id: string;
  phoneE164: string;
  email?: string | undefined;
  isActive: boolean;
};

export const createUserRepository = (db: Kysely<DatabaseSchema>) => {
  const findByPhone = async (phone: string): Promise<UserRecord | null> => {
    const row = await db
      .selectFrom('users')
      .select(['id', 'phone_e164', 'email', 'is_active'])
      .where('phone_e164', '=', phone)
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      phoneE164: row.phone_e164,
      email: row.email ?? undefined,
      isActive: row.is_active
    };
  };

  const createUser = async (phone: string): Promise<UserRecord> => {
    const row = await db
      .insertInto('users')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        phone_e164: phone,
        email: null,
        is_active: true,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returning(['id', 'phone_e164', 'email', 'is_active'])
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      phoneE164: row.phone_e164,
      email: row.email ?? undefined,
      isActive: row.is_active
    };
  };

  return {
    findByPhone,
    createUser
  };
};
