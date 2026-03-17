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
  if (!(await knex.schema.hasTable('notification_jobs'))) {
    await knex.schema.createTable('notification_jobs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table
        .uuid('event_id')
        .notNullable()
        .references('id')
        .inTable('outbox_events')
        .onDelete('CASCADE');
      table.text('event_type').notNullable();
      table.text('channel').notNullable();
      table.text('recipient').notNullable();
      table.text('template_id').notNullable();
      table.integer('template_version').notNullable();
      table.jsonb('payload').notNullable();
      table.text('dedupe_key').notNullable();
      table.text('status').notNullable();
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.text('last_error_code').nullable();
      table.text('last_error_message').nullable();
      table.text('provider').nullable();
      table.text('provider_message_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, 'notification_jobs', 'notification_jobs_status_check'))) {
    await knex.raw(`
      alter table notification_jobs
      add constraint notification_jobs_status_check
      check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'DEAD'))
    `);
  }

  if (!(await hasConstraint(knex, 'notification_jobs', 'notification_jobs_channel_check'))) {
    await knex.raw(`
      alter table notification_jobs
      add constraint notification_jobs_channel_check
      check (channel in ('whatsapp', 'sms', 'email'))
    `);
  }

  if (
    !(await hasConstraint(knex, 'notification_jobs', 'notification_jobs_dedupe_key_unique')) &&
    !(await hasIndex(knex, 'notification_jobs_dedupe_key_unique'))
  ) {
    await knex.schema.alterTable('notification_jobs', (table) => {
      table.unique(['dedupe_key'], {
        indexName: 'notification_jobs_dedupe_key_unique'
      });
    });
  }

  if (!(await hasIndex(knex, 'notification_jobs_tenant_created_at_idx'))) {
    await knex.raw(`
      create index notification_jobs_tenant_created_at_idx
      on notification_jobs (tenant_id, created_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'notification_jobs_tenant_status_updated_at_idx'))) {
    await knex.raw(`
      create index notification_jobs_tenant_status_updated_at_idx
      on notification_jobs (tenant_id, status, updated_at desc)
    `);
  }

  if (!(await hasIndex(knex, 'notification_jobs_event_id_idx'))) {
    await knex.raw(`
      create index notification_jobs_event_id_idx
      on notification_jobs (event_id)
    `);
  }

  if (!(await knex.schema.hasTable('notification_delivery_attempts'))) {
    await knex.schema.createTable('notification_delivery_attempts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      table
        .uuid('job_id')
        .notNullable()
        .references('id')
        .inTable('notification_jobs')
        .onDelete('CASCADE');
      table.integer('attempt_number').notNullable();
      table.text('provider').notNullable();
      table.text('result').notNullable();
      table.text('error_code').nullable();
      table.text('error_message').nullable();
      table.text('provider_message_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (
    !(await hasConstraint(
      knex,
      'notification_delivery_attempts',
      'notification_delivery_attempts_result_check'
    ))
  ) {
    await knex.raw(`
      alter table notification_delivery_attempts
      add constraint notification_delivery_attempts_result_check
      check (result in ('success', 'failed'))
    `);
  }

  if (!(await hasIndex(knex, 'notification_delivery_attempts_tenant_job_attempt_idx'))) {
    await knex.raw(`
      create index notification_delivery_attempts_tenant_job_attempt_idx
      on notification_delivery_attempts (tenant_id, job_id, attempt_number)
    `);
  }
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists('notification_delivery_attempts');
  await knex.schema.dropTableIfExists('notification_jobs');
};
