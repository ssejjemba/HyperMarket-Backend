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
        created_at: sql`now()`,
        revoked_at: null
      })
      .returning(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .executeTakeFirstOrThrow();

    return mapMembershipRecord(row);
  };

  const getMembership = async (tenantId: string, userId: string) => {
    const row = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row === undefined ? null : mapMembershipRecord(row);
  };

  const listMemberships = async (userId: string) => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .where('user_id', '=', userId)
      .execute();

    return rows.map((row) => mapMembershipRecord(row));
  };

  const listTenantMemberships = async (tenantId: string) => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => mapMembershipRecord(row));
  };

  const listActiveOwners = async (tenantId: string) => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .where('tenant_id', '=', tenantId)
      .where('role', '=', 'owner')
      .where('status', '=', 'active')
      .execute();

    return rows.map((row) => mapMembershipRecord(row));
  };

  const updateRole = async (
    tenantId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff'
  ) => {
    const row = await db
      .updateTable('tenant_memberships')
      .set({ role })
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .returning(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .executeTakeFirst();

    return row === undefined ? null : mapMembershipRecord(row);
  };

  const revokeMembership = async (tenantId: string, userId: string, _actorUserId: string) => {
    const row = await db
      .updateTable('tenant_memberships')
      .set({
        status: 'revoked',
        revoked_at: sql`coalesce(revoked_at, now())`
      })
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .returning(['tenant_id', 'user_id', 'role', 'status', 'created_at', 'revoked_at'])
      .executeTakeFirst();

    return row === undefined ? null : mapMembershipRecord(row);
  };

  return {
    createMembership,
    getMembership,
    listTenantMemberships,
    listMemberships,
    listActiveOwners,
    updateRole,
    revokeMembership
  };
};
