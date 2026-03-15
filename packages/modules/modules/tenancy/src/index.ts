import type { FastifyInstance } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { runInTransaction } from '@hypermarket/core/db';

import type { ModuleDeps } from '../../../src/types';
import { createTenancyRepository } from './repository';

const requireAdmin = (headers: Record<string, string | string[] | undefined>) => {
  const value = headers['x-admin'];
  const isAdmin = value === 'true' || value === '1';

  if (isAdmin === false) {
    throw new AppError({
      code: ErrorCode.Forbidden,
      message: 'Admin access required'
    });
  }
};

export const registerRoutes = async (server: FastifyInstance, deps: ModuleDeps): Promise<void> => {
  const repo = createTenancyRepository(deps.db, {
    platformRootDomain: deps.config.platformRootDomain
  });

  server.post('/admin/tenants', async (request) => {
    requireAdmin(request.headers as Record<string, string | string[] | undefined>);

    const payload = request.body as {
      name?: string;
      slug?: string;
      ownerUserId?: string;
      domain?: string;
    };

    if (
      payload?.name === undefined ||
      payload?.slug === undefined ||
      payload?.ownerUserId === undefined
    ) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: 'name, slug, and ownerUserId are required'
      });
    }

    if (payload.domain === undefined) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: 'domain is required'
      });
    }

    const name = payload.name;
    const slug = payload.slug;
    const ownerUserId = payload.ownerUserId;
    const domain = payload.domain;

    const tenant = await runInTransaction(deps.db, (trx) =>
      repo.createTenant(trx, {
        name,
        slug,
        ownerUserId,
        domain
      })
    );

    return { tenant };
  });

  server.get('/admin/tenants', async (request) => {
    requireAdmin(request.headers as Record<string, string | string[] | undefined>);

    const userId = (request.query as { user_id?: string }).user_id;
    if (userId === undefined || userId.length === 0) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: 'user_id is required'
      });
    }

    const tenants = await repo.listTenantsForUser(userId);

    return { tenants };
  });

  server.get('/storefront/resolve', async (request) => {
    const hostname = (request.query as { host?: string }).host;
    if (hostname === undefined || hostname.length === 0) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: 'host is required'
      });
    }

    const tenantId = await repo.resolveTenantByDomain(hostname);
    if (tenantId === null) {
      throw new AppError({
        code: ErrorCode.TenantResolutionFailed,
        message: 'Tenant not found'
      });
    }

    return { tenant_id: tenantId };
  });
};

export { createTenancyRepository } from './repository';
export type { TenantRecord, CreateTenantInput, MembershipRow } from './repository';
