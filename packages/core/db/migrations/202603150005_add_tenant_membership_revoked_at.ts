import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('tenant_memberships')) &&
    !(await knex.schema.hasColumn('tenant_memberships', 'revoked_at'))
  ) {
    await knex.schema.alterTable('tenant_memberships', (table) => {
      table.timestamp('revoked_at', { useTz: true }).nullable();
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('tenant_memberships')) &&
    (await knex.schema.hasColumn('tenant_memberships', 'revoked_at'))
  ) {
    await knex.schema.alterTable('tenant_memberships', (table) => {
      table.dropColumn('revoked_at');
    });
  }
};
