import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index('idempotency_keys_tenant_id_idx');
    table.string('operation', 128).notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.string('request_hash', 128).notNullable();
    table.string('response_ref', 256).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'operation', 'idempotency_key'], {
      indexName: 'idempotency_keys_unique_key'
    });
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('idempotency_keys');
};
