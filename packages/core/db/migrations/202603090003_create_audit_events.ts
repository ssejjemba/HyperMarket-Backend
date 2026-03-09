import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable('audit_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index('audit_events_tenant_id_idx');
    table.uuid('actor_user_id').nullable().index('audit_events_actor_user_id_idx');
    table.string('action', 128).notNullable();
    table.string('target_type', 128).notNullable();
    table.string('target_id', 128).notNullable();
    table.jsonb('before').nullable();
    table.jsonb('after').nullable();
    table.uuid('request_id').nullable();
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('audit_events');
};
