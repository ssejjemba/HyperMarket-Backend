import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import { TenantSlug } from '../domain/TenantSlug';
import { TenancyError } from '../errors/TenancyError';
import { createTenantDomainRepoPg } from '../persistence/TenantDomainRepoPg';
import { createTenantMembershipRepoPg } from '../persistence/TenantMembershipRepoPg';
import { createTenantRepoPg } from '../persistence/TenantRepoPg';
import { createTenantSettingsRepoPg } from '../persistence/TenantSettingsRepoPg';
import { toAuditRequestId } from './auditRequestId';

const slugifyBusinessName = (businessName: string): string => {
  return businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-{2,}/g, '-');
};

export type CreateTenantInput = {
  businessName: string;
  slug?: string | undefined;
  ownerUserId: string;
  requestId?: string | undefined;
};

export type CreateTenantOutput = {
  tenant: {
    id: string;
    businessName: string;
    slug: string;
    status: 'active' | 'suspended' | 'archived';
  };
  primaryDomain: string;
};

export type CreateTenantUseCase = {
  execute(input: CreateTenantInput): Promise<CreateTenantOutput>;
};

export type CreateTenantUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
  platformRootDomain: string;
};

export const createCreateTenantUseCase = (deps: CreateTenantUseCaseDeps): CreateTenantUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
      const requestedSlug = input.slug ?? slugifyBusinessName(input.businessName);
      const slug = TenantSlug.parse(requestedSlug);
      const primaryDomain = `${slug.toString()}.${deps.platformRootDomain}`;

      await runInTransaction(deps.db, async (trx) => {
        const tenantRepo = createTenantRepoPg(trx);
        const domainRepo = createTenantDomainRepoPg(trx, {
          platformRootDomain: deps.platformRootDomain
        });
        const membershipRepo = createTenantMembershipRepoPg(trx);
        const settingsRepo = createTenantSettingsRepoPg(trx);

        const existingTenant = await tenantRepo.findBySlug(slug.toString());
        if (existingTenant !== null) {
          throw new TenancyError({
            code: ErrorCode.TenantSlugTaken,
            message: 'Tenant slug is already taken'
          });
        }

        const tenant = await tenantRepo.createTenant(trx, {
          name: input.businessName,
          slug: slug.toString(),
          status: 'active'
        });

        await domainRepo.createDomainMapping({
          tenantId: tenant.id,
          domain: primaryDomain,
          type: 'subdomain',
          status: 'verified',
          isPrimary: true
        });

        await membershipRepo.createMembership(tenant.id, input.ownerUserId, 'owner');
        await settingsRepo.upsertSettings(tenant.id, {});

        await auditWriter.write(trx, {
          tenantId: tenant.id,
          actorUserId: input.ownerUserId,
          action: 'tenant.created',
          targetType: 'tenant',
          targetId: tenant.id,
          after: {
            slug: tenant.slug,
            business_name: tenant.name,
            primary_domain: primaryDomain,
            owner_user_id: input.ownerUserId
          },
          requestId: toAuditRequestId(input.requestId)
        });
      });

      const createdTenant = await createTenantRepoPg(deps.db).findBySlug(slug.toString());
      if (createdTenant === null) {
        throw new TenancyError({
          code: ErrorCode.TenantNotFound,
          message: 'Tenant not found after creation'
        });
      }

      return {
        tenant: {
          id: createdTenant.id,
          businessName: createdTenant.name,
          slug: createdTenant.slug,
          status: createdTenant.status
        },
        primaryDomain
      };
    }
  };
};
