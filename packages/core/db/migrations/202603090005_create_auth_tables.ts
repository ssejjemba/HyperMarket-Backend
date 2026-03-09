import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable('auth_otps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('phone_e164', 32).notNullable().index('auth_otps_phone_idx');
    table.string('code_hash', 128).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index('sessions_user_id_idx');
    table.string('token_id', 128).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('revoked_at', { useTz: true }).nullable();
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('auth_otps');
};
