import type { Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('tenant_settings')) &&
    !(await knex.schema.hasColumn('tenant_settings', 'contact_whatsapp_e164'))
  ) {
    await knex.schema.alterTable('tenant_settings', (table) => {
      table.text('contact_whatsapp_e164').nullable();
    });
  }
};

export const down = async (knex: Knex): Promise<void> => {
  if (
    (await knex.schema.hasTable('tenant_settings')) &&
    (await knex.schema.hasColumn('tenant_settings', 'contact_whatsapp_e164'))
  ) {
    await knex.schema.alterTable('tenant_settings', (table) => {
      table.dropColumn('contact_whatsapp_e164');
    });
  }
};
