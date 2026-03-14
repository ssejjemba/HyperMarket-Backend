import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.table('tenant_memberships', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.table('tenant_memberships', (table) => {
    table.dropColumn('is_active');
  });
};
