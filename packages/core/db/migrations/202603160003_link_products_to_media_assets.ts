import type { Knex } from 'knex';

const hasConstraint = async (
  knex: Knex,
  tableName: string,
  constraintName: string
): Promise<boolean> => {
  const result = await knex.raw<{ rows: Array<{ exists: boolean }> }>(
    `
      select exists (
        select 1
        from pg_constraint
        where conname = ?
          and conrelid = ?::regclass
      ) as exists
    `,
    [constraintName, tableName]
  );

  return result.rows[0]?.exists === true;
};

export const up = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('products')) &&
    (await knex.schema.hasTable('media_assets')) &&
    (await knex.schema.hasColumn('products', 'primary_image_asset_id')) &&
    !(await hasConstraint(knex, 'products', 'products_primary_image_asset_id_foreign'))
  ) {
    await knex.schema.alterTable('products', (table) => {
      table
        .foreign('primary_image_asset_id', 'products_primary_image_asset_id_foreign')
        .references('media_assets.id')
        .onDelete('SET NULL');
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('products')) &&
    (await hasConstraint(knex, 'products', 'products_primary_image_asset_id_foreign'))
  ) {
    await knex.schema.alterTable('products', (table) => {
      table.dropForeign(['primary_image_asset_id'], 'products_primary_image_asset_id_foreign');
    });
  }
};
