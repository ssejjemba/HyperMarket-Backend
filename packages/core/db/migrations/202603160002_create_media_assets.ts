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

const hasIndex = async (knex: Knex, indexName: string): Promise<boolean> => {
  const result = await knex.raw<{ rows: Array<{ exists: boolean }> }>(
    `
      select exists (
        select 1
        from pg_indexes
        where schemaname = current_schema()
          and indexname = ?
      ) as exists
    `,
    [indexName]
  );

  return result.rows[0]?.exists === true;
};

export const up = async (knex: Knex): Promise<void> => {
  if (!(await knex.schema.hasTable('media_assets'))) {
    await knex.schema.createTable('media_assets', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('storage_key').notNullable();
      table.text('mime_type').notNullable();
      table.bigInteger('byte_size').notNullable();
      table.integer('width').nullable();
      table.integer('height').nullable();
      table.text('checksum').nullable();
      table.text('status').notNullable().defaultTo('uploaded');
      table
        .uuid('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });
  }

  if (!(await hasConstraint(knex, 'media_assets', 'media_assets_status_check'))) {
    await knex.raw(`
      alter table media_assets
      add constraint media_assets_status_check
      check (status in ('uploaded', 'confirmed', 'deleted'))
    `);
  }

  if (
    !(await hasConstraint(knex, 'media_assets', 'media_assets_tenant_storage_key_unique')) &&
    !(await hasIndex(knex, 'media_assets_tenant_storage_key_unique'))
  ) {
    await knex.schema.alterTable('media_assets', (table) => {
      table.unique(['tenant_id', 'storage_key'], {
        indexName: 'media_assets_tenant_storage_key_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'media_assets_tenant_created_at_idx'))) {
    await knex.raw(`
      create index media_assets_tenant_created_at_idx
      on media_assets (tenant_id, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'media_assets_tenant_status_created_at_idx'))) {
    await knex.raw(`
      create index media_assets_tenant_status_created_at_idx
      on media_assets (tenant_id, status, created_at desc)
    `);
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('media_assets');
};
