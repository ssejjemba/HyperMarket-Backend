import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import { DomainName } from '../domain/DomainName';
import { TenantSlug } from '../domain/TenantSlug';
import type { CreateDomainMappingInput, TenantDomainRepository } from './TenantDomainRepository';
import { createTenantRepoPg } from './TenantRepoPg';
import { mapTenantDomainRow } from './mappers';

export type CreateTenantDomainRepoPgOptions = {
  platformRootDomain?: string;
};

export const createTenantDomainRepoPg = (
  db: Kysely<DatabaseSchema>,
  options: CreateTenantDomainRepoPgOptions = {}
): TenantDomainRepository => {
  const tenantRepo = createTenantRepoPg(db);

  const createDomainMapping = async (input: CreateDomainMappingInput) => {
    if (input.type === 'subdomain') {
      const tenant = await tenantRepo.findById(input.tenantId);
      const tenantSlug = tenant === null ? null : TenantSlug.parse(tenant.slug);
      DomainName.parseSubdomain(
        input.domain,
        tenantSlug ??
          (() => {
            throw new Error('Tenant must exist before creating a subdomain mapping');
          })(),
        options.platformRootDomain ?? ''
      );
    }

    const row = await db
      .insertInto('tenant_domains')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: input.tenantId,
        domain: input.domain,
        domain_type: input.type,
        verification_status: input.status,
        is_primary: input.isPrimary,
        created_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapTenantDomainRow(row);
  };

  const findTenantIdByDomain = async (domain: string) => {
    const row = await db
      .selectFrom('tenant_domains')
      .select('tenant_id')
      .where('domain', '=', domain)
      .executeTakeFirst();
    return row?.tenant_id ?? null;
  };

  const listDomains = async (tenantId: string) => {
    const rows = await db
      .selectFrom('tenant_domains')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .execute();

    return rows.map((row) => mapTenantDomainRow(row));
  };

  return {
    createDomainMapping,
    findTenantIdByDomain,
    listDomains
  };
};
