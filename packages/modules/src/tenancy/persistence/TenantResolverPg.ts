import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import type { TenantResolver } from '../TenantResolver';
import { createTenancyRepository } from './TenancyRepoPg';

export const createTenantResolverPg = (db: Kysely<DatabaseSchema>): TenantResolver => {
  const repo = createTenancyRepository(db);

  return {
    resolveTenantIdByDomain(domain: string): Promise<string | null> {
      return repo.resolveTenantByDomain(domain);
    }
  };
};
