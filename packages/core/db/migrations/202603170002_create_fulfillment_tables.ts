import type { Knex } from 'knex';

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
  if (!(await knex.schema.hasTable('fulfillment_settings'))) {
    await knex.schema.createTable('fulfillment_settings', (table) => {
      table.uuid('tenant_id').primary().references('id').inTable('tenants').onDelete('CASCADE');
      table.boolean('pickup_enabled').notNullable().defaultTo(true);
      table.boolean('delivery_enabled').notNullable().defaultTo(false);
      table.text('pickup_instructions').nullable();
      table.text('delivery_instructions').nullable();
      table.jsonb('business_hours').notNullable().defaultTo('{}');
      table.jsonb('cutoff_rules').notNullable().defaultTo('{}');
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('delivery_zones'))) {
    await knex.schema.createTable('delivery_zones', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('name').notNullable();
      table.integer('fee_amount').notNullable();
      table.integer('min_order_amount').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasIndex(knex, 'delivery_zones_tenant_name_unique'))) {
    await knex.raw(`
      create unique index delivery_zones_tenant_name_unique
      on delivery_zones (tenant_id, name)
    `);
  }

  if (!(await hasIndex(knex, 'delivery_zones_tenant_active_sort_idx'))) {
    await knex.raw(`
      create index delivery_zones_tenant_active_sort_idx
      on delivery_zones (tenant_id, is_active, sort_order)
    `);
  }

  if (!(await hasIndex(knex, 'delivery_zones_tenant_created_at_idx'))) {
    await knex.raw(`
      create index delivery_zones_tenant_created_at_idx
      on delivery_zones (tenant_id, created_at desc)
    `);
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('delivery_zones');
  await knex.schema.dropTableIfExists('fulfillment_settings');
};
