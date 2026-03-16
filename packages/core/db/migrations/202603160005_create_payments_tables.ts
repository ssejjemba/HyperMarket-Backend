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
  if (!(await knex.schema.hasTable('payment_intents'))) {
    await knex.schema.createTable('payment_intents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
      table.text('provider').notNullable();
      table.text('method').notNullable();
      table.text('status').notNullable();
      table.integer('amount').notNullable();
      table.text('currency').notNullable().defaultTo('UGX');
      table.text('provider_reference').nullable();
      table.text('customer_phone_e164').nullable();
      table.text('failure_code').nullable();
      table.text('failure_message').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'payment_intents', 'payment_intents_method_check'))) {
    await knex.raw(`
      alter table payment_intents
      add constraint payment_intents_method_check
      check (method in ('mobile_money', 'card', 'bank'))
    `);
  }

  if (!(await hasConstraint(knex, 'payment_intents', 'payment_intents_status_check'))) {
    await knex.raw(`
      alter table payment_intents
      add constraint payment_intents_status_check
      check (status in ('CREATED', 'PENDING_PROVIDER', 'AWAITING_CUSTOMER', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'))
    `);
  }

  if (!(await hasIndex(knex, 'payment_intents_tenant_order_created_at_idx'))) {
    await knex.raw(`
      create index payment_intents_tenant_order_created_at_idx
      on payment_intents (tenant_id, order_id, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'payment_intents_tenant_status_updated_at_idx'))) {
    await knex.raw(`
      create index payment_intents_tenant_status_updated_at_idx
      on payment_intents (tenant_id, status, updated_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'payment_intents_provider_reference_idx'))) {
    await knex.raw(`
      create unique index payment_intents_provider_reference_idx
      on payment_intents (provider, provider_reference)
      where provider_reference is not null
    `);
  }

  if (!(await knex.schema.hasTable('payment_provider_events'))) {
    await knex.schema.createTable('payment_provider_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.text('provider').notNullable();
      table.text('provider_event_id').notNullable();
      table.uuid('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
      table
        .uuid('intent_id')
        .nullable()
        .references('id')
        .inTable('payment_intents')
        .onDelete('SET NULL');
      table.uuid('order_id').nullable().references('id').inTable('orders').onDelete('SET NULL');
      table.jsonb('payload').notNullable();
      table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (
    !(await hasConstraint(
      knex,
      'payment_provider_events',
      'payment_provider_events_provider_provider_event_id_unique'
    )) &&
    !(await hasIndex(knex, 'payment_provider_events_provider_provider_event_id_unique'))
  ) {
    await knex.schema.alterTable('payment_provider_events', (table) => {
      table.unique(['provider', 'provider_event_id'], {
        indexName: 'payment_provider_events_provider_provider_event_id_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'payment_provider_events_provider_received_at_idx'))) {
    await knex.raw(`
      create index payment_provider_events_provider_received_at_idx
      on payment_provider_events (provider, received_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'payment_provider_events_tenant_received_at_idx'))) {
    await knex.raw(`
      create index payment_provider_events_tenant_received_at_idx
      on payment_provider_events (tenant_id, received_at desc)
      where tenant_id is not null
    `);
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('payment_provider_events');
  await knex.schema.dropTableIfExists('payment_intents');
};
