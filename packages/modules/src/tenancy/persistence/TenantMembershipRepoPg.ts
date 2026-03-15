import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { TenantMembershipRepository } from './TenantMembershipRepository';
import { mapMembershipRecord } from './mappers';

export const createTenantMembershipRepoPg = (
  db: Kysely<DatabaseSchema>
): TenantMembershipRepository => {
  const createMembership = async (
    tenantId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff'
  ) => {
    const row = await db
      .insertInto('tenant_memberships')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantId,
        user_id: userId,
        role,
        status: 'active',
        created_at: sql`now()`
      })
      .returning(['tenant_id', 'user_id', 'role', 'status', 'created_at'])
      .executeTakeFirstOrThrow();

    return mapMembershipRecord(row);
  };

  const findMembership = async (tenantId: string, userId: string) => {
    const row = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row === undefined ? null : mapMembershipRecord(row);
  };

  const listMemberships = async (userId: string) => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at'])
      .where('user_id', '=', userId)
      .execute();

    return rows.map((row) => mapMembershipRecord(row));
  };

  const revokeMembership = async (tenantId: string, userId: string) => {
    const row = await db
      .updateTable('tenant_memberships')
      .set({ status: 'revoked' })
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .returning(['tenant_id', 'user_id', 'role', 'status', 'created_at'])
      .executeTakeFirst();

    return row === undefined ? null : mapMembershipRecord(row);
  };

  return {
    createMembership,
    findMembership,
    listMemberships,
    revokeMembership
  };
};
