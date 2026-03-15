import type { Knex } from 'knex';

const TABLE_NAME = 'auth_otps';
const COLUMN_NAME = 'code_hash';

export const up = async (knex: Knex): Promise<void> => {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) {
    return;
  }

  await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN ${COLUMN_NAME} DROP NOT NULL`);
};

export const down = async (knex: Knex): Promise<void> => {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) {
    return;
  }

  await knex(TABLE_NAME)
    .whereNull(COLUMN_NAME)
    .update({ [COLUMN_NAME]: '' });
  await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN ${COLUMN_NAME} SET NOT NULL`);
};
