import type { Knex } from 'knex';

const SESSIONS_TABLE = 'sessions';
const USER_FK_NAME = 'sessions_user_id_fk';

export const up = async (knex: Knex): Promise<void> => {
  const hasSessions = await knex.schema.hasTable(SESSIONS_TABLE);

  if (!hasSessions) {
    await knex.schema.createTable(SESSIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().index('sessions_user_id_idx');
      table.text('token_hash').notNullable();
      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.timestamp('revoked_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.foreign('user_id', USER_FK_NAME).references('users.id').onDelete('CASCADE');
    });
    return;
  }

  const hasTokenId = await knex.schema.hasColumn(SESSIONS_TABLE, 'token_id');
  const hasTokenHash = await knex.schema.hasColumn(SESSIONS_TABLE, 'token_hash');

  if (hasTokenId && !hasTokenHash) {
    await knex.schema.alterTable(SESSIONS_TABLE, (table) => {
      table.renameColumn('token_id', 'token_hash');
    });
  }

  if (!(await knex.schema.hasColumn(SESSIONS_TABLE, 'token_hash'))) {
    await knex.schema.alterTable(SESSIONS_TABLE, (table) => {
      table.text('token_hash').notNullable().defaultTo('');
    });
    await knex(SESSIONS_TABLE).update({ token_hash: '' });
    await knex.schema.alterTable(SESSIONS_TABLE, (table) => {
      table.dropDefault('token_hash');
    });
  }

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${USER_FK_NAME}'
      ) THEN
        ALTER TABLE ${SESSIONS_TABLE}
        ADD CONSTRAINT ${USER_FK_NAME}
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);
};

export const down = async (knex: Knex): Promise<void> => {
  const hasSessions = await knex.schema.hasTable(SESSIONS_TABLE);
  if (!hasSessions) {
    return;
  }

  const hasTokenHash = await knex.schema.hasColumn(SESSIONS_TABLE, 'token_hash');
  const hasTokenId = await knex.schema.hasColumn(SESSIONS_TABLE, 'token_id');

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${USER_FK_NAME}'
      ) THEN
        ALTER TABLE ${SESSIONS_TABLE}
        DROP CONSTRAINT ${USER_FK_NAME};
      END IF;
    END
    $$;
  `);

  if (hasTokenHash && !hasTokenId) {
    await knex.schema.alterTable(SESSIONS_TABLE, (table) => {
      table.renameColumn('token_hash', 'token_id');
    });
  }
};
