import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable('outbox_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('event_type', 128).notNullable();
    table.uuid('tenant_id').nullable().index('outbox_events_tenant_id_idx');
    table.uuid('correlation_id').nullable();
    table.uuid('actor_user_id').nullable();
    table.jsonb('payload').notNullable();
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('available_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('dispatched_at', { useTz: true }).nullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.text('last_error').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('outbox_events');
};
