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
  if (!(await knex.schema.hasTable('categories'))) {
    await knex.schema.createTable('categories', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('name').notNullable();
      table.text('slug').notNullable();
      table.text('description').nullable();
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('is_visible').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });
  }

  if (
    !(await hasConstraint(knex, 'categories', 'categories_tenant_slug_unique')) &&
    !(await hasIndex(knex, 'categories_tenant_slug_unique'))
  ) {
    await knex.schema.alterTable('categories', (table) => {
      table.unique(['tenant_id', 'slug'], {
        indexName: 'categories_tenant_slug_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'categories_tenant_visible_sort_idx'))) {
    await knex.schema.alterTable('categories', (table) => {
      table.index(['tenant_id', 'is_visible', 'sort_order'], 'categories_tenant_visible_sort_idx');
    });
  }

  if (!(await knex.schema.hasTable('products'))) {
    await knex.schema.createTable('products', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('name').notNullable();
      table.text('slug').notNullable();
      table.text('description').nullable();
      table.text('status').notNullable().defaultTo('draft');
      table.uuid('primary_image_asset_id').nullable();
      table.integer('price_amount').notNullable();
      table.integer('compare_at_price_amount').nullable();
      table.text('currency').notNullable().defaultTo('UGX');
      table.boolean('track_inventory').notNullable().defaultTo(false);
      table.integer('stock_quantity').nullable();
      table.text('sku').nullable();
      table.jsonb('attributes').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });
  }

  if (
    !(await hasConstraint(knex, 'products', 'products_tenant_slug_unique')) &&
    !(await hasIndex(knex, 'products_tenant_slug_unique'))
  ) {
    await knex.schema.alterTable('products', (table) => {
      table.unique(['tenant_id', 'slug'], {
        indexName: 'products_tenant_slug_unique'
      });
    });
  }

  if (!(await hasConstraint(knex, 'products', 'products_status_check'))) {
    await knex.raw(`
      alter table products
      add constraint products_status_check
      check (status in ('active', 'draft', 'archived'))
    `);
  }

  if (!(await hasIndex(knex, 'products_tenant_status_updated_at_idx'))) {
    await knex.raw(`
      create index products_tenant_status_updated_at_idx
      on products (tenant_id, status, updated_at desc)
    `);
  }

  if (!(await knex.schema.hasTable('product_variants'))) {
    await knex.schema.createTable('product_variants', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table
        .uuid('product_id')
        .notNullable()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE');
      table.text('name').notNullable();
      table.text('sku').nullable();
      table.integer('price_amount').nullable();
      table.integer('stock_quantity').nullable();
      table.jsonb('options').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (
    !(await hasConstraint(
      knex,
      'product_variants',
      'product_variants_tenant_product_name_unique'
    )) &&
    !(await hasIndex(knex, 'product_variants_tenant_product_name_unique'))
  ) {
    await knex.schema.alterTable('product_variants', (table) => {
      table.unique(['tenant_id', 'product_id', 'name'], {
        indexName: 'product_variants_tenant_product_name_unique'
      });
    });
  }

  if (!(await knex.schema.hasTable('product_categories'))) {
    await knex.schema.createTable('product_categories', (table) => {
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table
        .uuid('product_id')
        .notNullable()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE');
      table
        .uuid('category_id')
        .notNullable()
        .references('id')
        .inTable('categories')
        .onDelete('CASCADE');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.primary(['tenant_id', 'product_id', 'category_id']);
    });
  }

  if (!(await hasIndex(knex, 'product_categories_tenant_category_product_idx'))) {
    await knex.schema.alterTable('product_categories', (table) => {
      table.index(
        ['tenant_id', 'category_id', 'product_id'],
        'product_categories_tenant_category_product_idx'
      );
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('product_categories');
  await knex.schema.dropTableIfExists('product_variants');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('categories');
};
