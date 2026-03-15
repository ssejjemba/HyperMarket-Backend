import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import type { TenantResolver } from '../TenantResolver';
import type { CreateTenantDomainRepoPgOptions } from './TenantDomainRepoPg';
import { createTenantDomainRepoPg } from './TenantDomainRepoPg';

export const createTenantResolverPg = (
  db: Kysely<DatabaseSchema>,
  options: CreateTenantDomainRepoPgOptions = {}
): TenantResolver => {
  const domainRepo = createTenantDomainRepoPg(db, options);

  return {
    resolveTenantIdByDomain(domain: string): Promise<string | null> {
      return domainRepo.findTenantIdByDomain(domain);
    }
  };
};
