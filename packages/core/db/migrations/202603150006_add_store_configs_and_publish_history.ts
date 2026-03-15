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
  if (!(await knex.schema.hasTable('store_configs'))) {
    await knex.schema.createTable('store_configs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('status').notNullable().defaultTo('draft');
      table.text('template_id').notNullable();
      table.text('template_version').notNullable();
      table.integer('config_version').notNullable();
      table.jsonb('config_payload').notNullable();
      table.jsonb('validation_report').nullable();
      table.uuid('created_by_user_id').notNullable().references('id').inTable('users');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'store_configs', 'store_configs_status_check'))) {
    await knex.raw(`
      alter table store_configs
      add constraint store_configs_status_check
      check (status in ('draft', 'active', 'archived'))
    `);
  }

  if (!(await hasConstraint(knex, 'store_configs', 'store_configs_tenant_version_unique'))) {
    await knex.schema.alterTable('store_configs', (table) => {
      table.unique(['tenant_id', 'config_version'], {
        indexName: 'store_configs_tenant_version_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'store_configs_tenant_created_at_idx'))) {
    await knex.schema.alterTable('store_configs', (table) => {
      table.index(['tenant_id', 'created_at'], 'store_configs_tenant_created_at_idx');
    });
  }

  if (!(await hasIndex(knex, 'store_configs_tenant_active_idx'))) {
    await knex.raw(`
      create unique index store_configs_tenant_active_idx
      on store_configs (tenant_id)
      where status = 'active'
    `);
  }

  if (!(await knex.schema.hasTable('publish_history'))) {
    await knex.schema.createTable('publish_history', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table.text('action').notNullable();
      table
        .uuid('from_config_id')
        .nullable()
        .references('id')
        .inTable('store_configs')
        .onDelete('SET NULL');
      table
        .uuid('to_config_id')
        .notNullable()
        .references('id')
        .inTable('store_configs')
        .onDelete('CASCADE');
      table.uuid('actor_user_id').notNullable().references('id').inTable('users');
      table.text('result').notNullable();
      table.text('failure_reason').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'publish_history', 'publish_history_action_check'))) {
    await knex.raw(`
      alter table publish_history
      add constraint publish_history_action_check
      check (action in ('publish', 'rollback'))
    `);
  }

  if (!(await hasConstraint(knex, 'publish_history', 'publish_history_result_check'))) {
    await knex.raw(`
      alter table publish_history
      add constraint publish_history_result_check
      check (result in ('success', 'failed'))
    `);
  }

  if (!(await hasIndex(knex, 'publish_history_tenant_created_at_idx'))) {
    await knex.schema.alterTable('publish_history', (table) => {
      table.index(['tenant_id', 'created_at'], 'publish_history_tenant_created_at_idx');
    });
  }

  if (
    (await knex.schema.hasTable('tenants')) &&
    (await knex.schema.hasColumn('tenants', 'active_config_id')) &&
    !(await hasConstraint(knex, 'tenants', 'tenants_active_config_id_foreign'))
  ) {
    await knex.schema.alterTable('tenants', (table) => {
      table
        .foreign('active_config_id', 'tenants_active_config_id_foreign')
        .references('store_configs.id')
        .onDelete('SET NULL');
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  if (await knex.schema.hasTable('tenants')) {
    if (await hasConstraint(knex, 'tenants', 'tenants_active_config_id_foreign')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.dropForeign(['active_config_id'], 'tenants_active_config_id_foreign');
      });
    }
  }

  if (await knex.schema.hasTable('publish_history')) {
    await knex.schema.dropTableIfExists('publish_history');
  }

  if (await knex.schema.hasTable('store_configs')) {
    if (await hasIndex(knex, 'store_configs_tenant_active_idx')) {
      await knex.raw('drop index if exists store_configs_tenant_active_idx');
    }

    await knex.schema.dropTableIfExists('store_configs');
  }
};
