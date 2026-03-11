import type { Knex } from 'knex';

/**
 * Replaces the original auth_otps table (which tracked consumed_at and
 * attempts) with a richer schema that supports the full OTP challenge
 * lifecycle: ACTIVE → CONSUMED | LOCKED | EXPIRED | SEND_FAILED.
 *
 * New columns:
 *   status        — lifecycle state, indexed for efficient polling
 *   attempt_count — replaces the old `attempts` column (renamed for clarity)
 *   max_attempts  — stored per-challenge so policy changes don't break
 *                   in-flight challenges
 *   last_sent_at  — updated on every (re-)send; drives resend cooldown
 *
 * New indexes:
 *   (phone_e164, created_at DESC) — look up recent challenges per phone
 *   (expires_at)                  — sweep expired rows in background jobs
 */
export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('auth_otps');

  await knex.schema.createTable('auth_otps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('phone_e164', 32).notNullable();
    table.string('code_hash', 128).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable();
    table
      .enum('status', ['ACTIVE', 'CONSUMED', 'LOCKED', 'EXPIRED', 'SEND_FAILED'])
      .notNullable()
      .defaultTo('ACTIVE');
    table.timestamp('last_sent_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Composite index for "find active challenges for this phone" queries
  await knex.raw(
    'CREATE INDEX auth_otps_phone_created_at_idx ON auth_otps (phone_e164, created_at DESC)'
  );

  // Index for expiry sweep jobs
  await knex.raw('CREATE INDEX auth_otps_expires_at_idx ON auth_otps (expires_at)');
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('auth_otps');

  // Restore the original schema so migrate:rollback leaves the DB consistent
  await knex.schema.createTable('auth_otps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('phone_e164', 32).notNullable().index('auth_otps_phone_idx');
    table.string('code_hash', 128).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};
