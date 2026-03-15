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
  if (await knex.schema.hasTable('tenants')) {
    if (await knex.schema.hasColumn('tenants', 'name')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.renameColumn('name', 'business_name');
      });
    }

    if (!(await knex.schema.hasColumn('tenants', 'business_name'))) {
      await knex.schema.alterTable('tenants', (table) => {
        table.text('business_name');
      });
    }

    if (!(await knex.schema.hasColumn('tenants', 'status'))) {
      await knex.schema.alterTable('tenants', (table) => {
        table.text('status');
      });
    }

    if (!(await knex.schema.hasColumn('tenants', 'default_currency'))) {
      await knex.schema.alterTable('tenants', (table) => {
        table.text('default_currency').notNullable().defaultTo('UGX');
      });
    }

    if (!(await knex.schema.hasColumn('tenants', 'active_config_id'))) {
      await knex.schema.alterTable('tenants', (table) => {
        table.uuid('active_config_id').nullable();
      });
    }

    if (await knex.schema.hasColumn('tenants', 'is_active')) {
      await knex.raw(`
        update tenants
        set status = case
          when is_active = true then 'active'
          else 'suspended'
        end
        where status is null
      `);
    } else {
      await knex.raw(`
        update tenants
        set status = 'active'
        where status is null
      `);
    }

    await knex.raw(`
      update tenants
      set business_name = coalesce(business_name, slug)
      where business_name is null
    `);

    await knex.raw(`
      alter table tenants
      alter column business_name set not null,
      alter column status set not null,
      alter column default_currency set default 'UGX',
      alter column default_currency set not null
    `);

    if (await knex.schema.hasColumn('tenants', 'is_active')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.dropColumn('is_active');
      });
    }

    if (!(await hasConstraint(knex, 'tenants', 'tenants_status_check'))) {
      await knex.raw(`
        alter table tenants
        add constraint tenants_status_check
        check (status in ('active', 'suspended', 'archived'))
      `);
    }
  }

  if (await knex.schema.hasTable('tenant_memberships')) {
    if (!(await knex.schema.hasColumn('tenant_memberships', 'role'))) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.text('role').notNullable().defaultTo('owner');
      });
    }

    if (!(await knex.schema.hasColumn('tenant_memberships', 'status'))) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.text('status');
      });
    }

    if (await knex.schema.hasColumn('tenant_memberships', 'is_active')) {
      await knex.raw(`
        update tenant_memberships
        set status = case
          when is_active = true then 'active'
          else 'revoked'
        end
        where status is null
      `);
    } else {
      await knex.raw(`
        update tenant_memberships
        set status = 'active'
        where status is null
      `);
    }

    await knex.raw(`
      alter table tenant_memberships
      alter column role set not null,
      alter column status set not null
    `);

    if (await knex.schema.hasColumn('tenant_memberships', 'is_active')) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.dropColumn('is_active');
      });
    }

    if (!(await hasConstraint(knex, 'tenant_memberships', 'tenant_memberships_role_check'))) {
      await knex.raw(`
        alter table tenant_memberships
        add constraint tenant_memberships_role_check
        check (role in ('owner', 'manager', 'staff'))
      `);
    }

    if (!(await hasConstraint(knex, 'tenant_memberships', 'tenant_memberships_status_check'))) {
      await knex.raw(`
        alter table tenant_memberships
        add constraint tenant_memberships_status_check
        check (status in ('active', 'revoked'))
      `);
    }

    if (!(await hasConstraint(knex, 'tenant_memberships', 'tenant_memberships_unique'))) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.unique(['tenant_id', 'user_id'], {
          indexName: 'tenant_memberships_unique'
        });
      });
    }
  }

  if (await knex.schema.hasTable('tenant_domains')) {
    if (await knex.schema.hasColumn('tenant_domains', 'hostname')) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.renameColumn('hostname', 'domain');
      });
    }

    if (!(await knex.schema.hasColumn('tenant_domains', 'domain_type'))) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.text('domain_type');
      });
    }

    if (!(await knex.schema.hasColumn('tenant_domains', 'verification_status'))) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.text('verification_status');
      });
    }

    await knex.raw(`
      update tenant_domains
      set domain_type = coalesce(domain_type, 'subdomain'),
          verification_status = coalesce(verification_status, 'verified')
    `);

    await knex.raw(`
      alter table tenant_domains
      alter column domain set not null,
      alter column domain_type set not null,
      alter column verification_status set not null,
      alter column is_primary set default true,
      alter column is_primary set not null
    `);

    if (!(await hasConstraint(knex, 'tenant_domains', 'tenant_domains_domain_type_check'))) {
      await knex.raw(`
        alter table tenant_domains
        add constraint tenant_domains_domain_type_check
        check (domain_type in ('subdomain', 'custom'))
      `);
    }

    if (
      !(await hasConstraint(knex, 'tenant_domains', 'tenant_domains_verification_status_check'))
    ) {
      await knex.raw(`
        alter table tenant_domains
        add constraint tenant_domains_verification_status_check
        check (verification_status in ('verified', 'pending', 'failed'))
      `);
    }

    if (!(await hasConstraint(knex, 'tenant_domains', 'tenant_domains_domain_unique'))) {
      await knex.raw(`
        alter table tenant_domains
        add constraint tenant_domains_domain_unique unique (domain)
      `);
    }

    if (!(await hasIndex(knex, 'tenant_domains_domain_idx'))) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.index(['domain'], 'tenant_domains_domain_idx');
      });
    }
  }

  if (!(await knex.schema.hasTable('tenant_settings'))) {
    await knex.schema.createTable('tenant_settings', (table) => {
      table.uuid('tenant_id').primary();
      table.text('contact_name').nullable();
      table.text('contact_email').nullable();
      table.text('contact_phone_e164').nullable();
      table.jsonb('social_links').notNullable().defaultTo('{}');
      table.jsonb('business_hours').notNullable().defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.foreign('tenant_id').references('tenants.id').onDelete('CASCADE');
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  if (await knex.schema.hasTable('tenant_settings')) {
    await knex.schema.dropTableIfExists('tenant_settings');
  }

  if (await knex.schema.hasTable('tenant_domains')) {
    if (await hasIndex(knex, 'tenant_domains_domain_idx')) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.dropIndex(['domain'], 'tenant_domains_domain_idx');
      });
    }

    if (await hasConstraint(knex, 'tenant_domains', 'tenant_domains_domain_unique')) {
      await knex.raw(`alter table tenant_domains drop constraint tenant_domains_domain_unique`);
    }

    if (await hasConstraint(knex, 'tenant_domains', 'tenant_domains_verification_status_check')) {
      await knex.raw(
        `alter table tenant_domains drop constraint tenant_domains_verification_status_check`
      );
    }

    if (await hasConstraint(knex, 'tenant_domains', 'tenant_domains_domain_type_check')) {
      await knex.raw(`alter table tenant_domains drop constraint tenant_domains_domain_type_check`);
    }

    if (await knex.schema.hasColumn('tenant_domains', 'verification_status')) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.dropColumn('verification_status');
      });
    }

    if (await knex.schema.hasColumn('tenant_domains', 'domain_type')) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.dropColumn('domain_type');
      });
    }

    if (await knex.schema.hasColumn('tenant_domains', 'domain')) {
      await knex.schema.alterTable('tenant_domains', (table) => {
        table.renameColumn('domain', 'hostname');
      });
    }
  }

  if (await knex.schema.hasTable('tenant_memberships')) {
    if (await hasConstraint(knex, 'tenant_memberships', 'tenant_memberships_status_check')) {
      await knex.raw(
        `alter table tenant_memberships drop constraint tenant_memberships_status_check`
      );
    }

    if (await hasConstraint(knex, 'tenant_memberships', 'tenant_memberships_role_check')) {
      await knex.raw(
        `alter table tenant_memberships drop constraint tenant_memberships_role_check`
      );
    }

    if (!(await knex.schema.hasColumn('tenant_memberships', 'is_active'))) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.boolean('is_active').notNullable().defaultTo(true);
      });

      await knex.raw(`
        update tenant_memberships
        set is_active = (status = 'active')
      `);
    }

    if (await knex.schema.hasColumn('tenant_memberships', 'status')) {
      await knex.schema.alterTable('tenant_memberships', (table) => {
        table.dropColumn('status');
      });
    }
  }

  if (await knex.schema.hasTable('tenants')) {
    if (await hasConstraint(knex, 'tenants', 'tenants_status_check')) {
      await knex.raw(`alter table tenants drop constraint tenants_status_check`);
    }

    if (await knex.schema.hasColumn('tenants', 'active_config_id')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.dropColumn('active_config_id');
      });
    }

    if (await knex.schema.hasColumn('tenants', 'default_currency')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.dropColumn('default_currency');
      });
    }

    if (!(await knex.schema.hasColumn('tenants', 'is_active'))) {
      await knex.schema.alterTable('tenants', (table) => {
        table.boolean('is_active').notNullable().defaultTo(true);
      });

      await knex.raw(`
        update tenants
        set is_active = (status = 'active')
      `);
    }

    if (await knex.schema.hasColumn('tenants', 'status')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.dropColumn('status');
      });
    }

    if (await knex.schema.hasColumn('tenants', 'business_name')) {
      await knex.schema.alterTable('tenants', (table) => {
        table.renameColumn('business_name', 'name');
      });
    }
  }
};
