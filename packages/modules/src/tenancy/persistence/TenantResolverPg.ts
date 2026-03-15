import { ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import { TenancyError } from '../errors/TenancyError';
import type { TenantResolutionCache, TenantResolver } from '../TenantResolver';
import { createNoopTenantResolutionCache } from './NoopTenantResolutionCache';
import type { CreateTenantDomainRepoPgOptions } from './TenantDomainRepoPg';
import { createTenantDomainRepoPg } from './TenantDomainRepoPg';
import { createTenantRepoPg } from './TenantRepoPg';

export type CreateTenantResolverPgOptions = CreateTenantDomainRepoPgOptions & {
  cache?: TenantResolutionCache | undefined;
};

const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

export const createTenantResolverPg = (
  db: Kysely<DatabaseSchema>,
  options: CreateTenantResolverPgOptions = {}
): TenantResolver => {
  const domainRepo = createTenantDomainRepoPg(db, options);
  const tenantRepo = createTenantRepoPg(db);
  const cache = options.cache ?? createNoopTenantResolutionCache();

  return {
    async resolveByDomain(domain: string) {
      const normalizedDomain = normalizeDomain(domain);
      const cached = await cache.get(normalizedDomain);
      if (cached !== null) {
        return cached;
      }

      const tenantId = await domainRepo.findTenantIdByDomain(normalizedDomain);
      if (tenantId === null) {
        throw new TenancyError({
          code: ErrorCode.TenantDomainNotFound,
          message: 'Tenant domain was not found'
        });
      }

      const tenant = await tenantRepo.findById(tenantId);
      if (tenant === null) {
        throw new TenancyError({
          code: ErrorCode.TenantNotFound,
          message: 'Tenant was not found'
        });
      }

      if (tenant.status === 'suspended') {
        throw new TenancyError({
          code: ErrorCode.TenantSuspended,
          message: 'Tenant is suspended'
        });
      }

      if (tenant.status === 'archived') {
        throw new TenancyError({
          code: ErrorCode.TenantArchived,
          message: 'Tenant is archived'
        });
      }

      const resolved = { tenantId, tenant };
      await cache.set(normalizedDomain, resolved);
      return resolved;
    }
  };
};
