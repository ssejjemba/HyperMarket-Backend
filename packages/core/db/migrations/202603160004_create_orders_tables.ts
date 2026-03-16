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
  if (!(await knex.schema.hasTable('customers'))) {
    await knex.schema.createTable('customers', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('full_name').nullable();
      table.text('phone_e164').nullable();
      table.text('email').nullable();
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasIndex(knex, 'customers_tenant_created_at_idx'))) {
    await knex.raw(`
      create index customers_tenant_created_at_idx
      on customers (tenant_id, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'customers_tenant_phone_e164_idx'))) {
    await knex.raw(`
      create index customers_tenant_phone_e164_idx
      on customers (tenant_id, phone_e164)
    `);
  }

  if (!(await knex.schema.hasTable('orders'))) {
    await knex.schema.createTable('orders', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.bigInteger('order_number').notNullable();
      table.text('status').notNullable();
      table.text('checkout_mode').notNullable();
      table.text('currency').notNullable().defaultTo('UGX');
      table.integer('subtotal_amount').notNullable();
      table.integer('delivery_fee_amount').notNullable().defaultTo(0);
      table.integer('discount_amount').notNullable().defaultTo(0);
      table.integer('total_amount').notNullable();
      table
        .uuid('customer_id')
        .nullable()
        .references('id')
        .inTable('customers')
        .onDelete('SET NULL');
      table.jsonb('customer_snapshot').notNullable();
      table.jsonb('fulfillment_snapshot').notNullable();
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'orders', 'orders_status_check'))) {
    await knex.raw(`
      alter table orders
      add constraint orders_status_check
      check (status in ('PENDING', 'CONFIRMED', 'CANCELLED', 'PAID', 'FAILED', 'FULFILLED', 'REFUNDED'))
    `);
  }

  if (!(await hasConstraint(knex, 'orders', 'orders_checkout_mode_check'))) {
    await knex.raw(`
      alter table orders
      add constraint orders_checkout_mode_check
      check (checkout_mode in ('pay_on_delivery', 'gateway_payment'))
    `);
  }

  if (
    !(await hasConstraint(knex, 'orders', 'orders_tenant_order_number_unique')) &&
    !(await hasIndex(knex, 'orders_tenant_order_number_unique'))
  ) {
    await knex.schema.alterTable('orders', (table) => {
      table.unique(['tenant_id', 'order_number'], {
        indexName: 'orders_tenant_order_number_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'orders_tenant_created_at_idx'))) {
    await knex.raw(`
      create index orders_tenant_created_at_idx
      on orders (tenant_id, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'orders_tenant_status_created_at_idx'))) {
    await knex.raw(`
      create index orders_tenant_status_created_at_idx
      on orders (tenant_id, status, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'orders_tenant_order_number_desc_idx'))) {
    await knex.raw(`
      create index orders_tenant_order_number_desc_idx
      on orders (tenant_id, order_number desc)
    `);
  }

  if (!(await knex.schema.hasTable('order_items'))) {
    await knex.schema.createTable('order_items', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
      table.uuid('product_id').nullable().references('id').inTable('products').onDelete('SET NULL');
      table
        .uuid('variant_id')
        .nullable()
        .references('id')
        .inTable('product_variants')
        .onDelete('SET NULL');
      table.text('title').notNullable();
      table.text('sku').nullable();
      table.integer('quantity').notNullable();
      table.integer('unit_price_amount').notNullable();
      table.integer('line_total_amount').notNullable();
      table.text('image_url').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasIndex(knex, 'order_items_tenant_order_id_idx'))) {
    await knex.raw(`
      create index order_items_tenant_order_id_idx
      on order_items (tenant_id, order_id)
    `);
  }

  if (!(await knex.schema.hasTable('order_state_history'))) {
    await knex.schema.createTable('order_state_history', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
      table.text('from_status').nullable();
      table.text('to_status').notNullable();
      table.text('reason').nullable();
      table.text('actor_type').notNullable();
      table.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'order_state_history', 'order_state_history_actor_type_check'))) {
    await knex.raw(`
      alter table order_state_history
      add constraint order_state_history_actor_type_check
      check (actor_type in ('system', 'merchant', 'customer'))
    `);
  }

  if (!(await hasIndex(knex, 'order_state_history_tenant_order_created_at_idx'))) {
    await knex.raw(`
      create index order_state_history_tenant_order_created_at_idx
      on order_state_history (tenant_id, order_id, created_at desc)
    `);
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('order_state_history');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('customers');
};
