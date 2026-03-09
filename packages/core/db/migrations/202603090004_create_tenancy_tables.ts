import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable('tenants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 128).notNullable();
    table.string('slug', 128).notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tenant_memberships', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index('tenant_memberships_tenant_id_idx');
    table.uuid('user_id').notNullable().index('tenant_memberships_user_id_idx');
    table.string('role', 64).notNullable().defaultTo('owner');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'user_id'], {
      indexName: 'tenant_memberships_unique'
    });
  });

  await knex.schema.createTable('tenant_domains', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index('tenant_domains_tenant_id_idx');
    table.string('hostname', 255).notNullable().unique();
    table.boolean('is_primary').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('tenant_domains');
  await knex.schema.dropTableIfExists('tenant_memberships');
  await knex.schema.dropTableIfExists('tenants');
};
