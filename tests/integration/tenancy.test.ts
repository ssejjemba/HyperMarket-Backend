import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { createDbClient, sql } from '../../packages/core/src/db/index';
import {
  createCreateTenantUseCase,
  createTenantResolverPg,
  createTenantDomainRepoPg,
  createTenantMembershipRepoPg,
  createTenantRepoPg,
  createTenantSettingsRepoPg,
  TenancyError
} from '../../packages/modules/src/tenancy/index';
import { ErrorCode } from '../../packages/contracts/src/errors/errorCodes';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for tenancy integration tests');
}

const buildTestUuid = (prefix: string, suffix: string): string =>
  `${prefix}0000-0000-0000-0000-${suffix}`;

const run = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(databaseUrl);
  await sql`
    alter table tenant_memberships
    add column if not exists revoked_at timestamptz null
  `.execute(db);
  const tenantRepo = createTenantRepoPg(db);
  const domainRepo = createTenantDomainRepoPg(db, {
    platformRootDomain: config.platformRootDomain
  });
  const membershipRepo = createTenantMembershipRepoPg(db);
  const settingsRepo = createTenantSettingsRepoPg(db);
  const resolver = createTenantResolverPg(db, {
    platformRootDomain: config.platformRootDomain
  });
  const createTenantUseCase = createCreateTenantUseCase({
    db,
    platformRootDomain: config.platformRootDomain
  });

  const stamp = Date.now();
  const uuidSuffix = stamp.toString().slice(-12).padStart(12, '0');
  const slug = `test-tenant-${stamp}`;
  const domain = `${slug}.${config.platformRootDomain}`;
  const ownerUserId = buildTestUuid('1000', uuidSuffix);
  const observerUserId = buildTestUuid('2000', uuidSuffix);
  const staffUserId = buildTestUuid('3000', uuidSuffix);
  const secondOwnerUserId = buildTestUuid('4000', uuidSuffix);

  await db
    .insertInto('users')
    .values([
      {
        id: ownerUserId,
        phone_e164: `+256701${uuidSuffix.slice(-6)}`,
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: observerUserId,
        phone_e164: `+256702${uuidSuffix.slice(-6)}`,
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])
    .execute();

  const createResult = await createTenantUseCase.execute({
    businessName: 'Test Tenant',
    slug,
    ownerUserId,
    requestId: `tenant-create-${stamp}`
  });
  const tenant = await tenantRepo.findById(createResult.tenant.id);
  assert.ok(tenant);
  assert.equal(createResult.tenant.slug, slug);
  assert.equal(createResult.primaryDomain, domain);

  const resolvedTenant = await resolver.resolveByDomain(domain.toUpperCase());
  assert.equal(resolvedTenant.tenantId, createResult.tenant.id);
  assert.equal(resolvedTenant.tenant.slug, slug);

  const resolvedTenantId = await domainRepo.findTenantIdByDomain(domain);
  assert.equal(resolvedTenantId, createResult.tenant.id);

  const list = await tenantRepo.listForUser(ownerUserId);
  assert.ok(list.some((item) => item.id === createResult.tenant.id));

  const memberships = await membershipRepo.listMemberships(ownerUserId);
  assert.ok(
    memberships.some(
      (item) => item.tenantId === createResult.tenant.id && item.userId === ownerUserId
    )
  );

  const initialOwnerMembership = await membershipRepo.getMembership(
    createResult.tenant.id,
    ownerUserId
  );
  assert.ok(initialOwnerMembership);
  assert.equal(initialOwnerMembership.role, 'owner');
  assert.equal(initialOwnerMembership.status, 'active');
  assert.equal(initialOwnerMembership.revokedAt, null);

  const activeOwners = await membershipRepo.listActiveOwners(createResult.tenant.id);
  assert.equal(activeOwners.length, 1);
  assert.equal(activeOwners[0]?.userId, ownerUserId);

  const listedDomains = await domainRepo.listDomains(createResult.tenant.id);
  assert.ok(listedDomains.some((item) => item.domain === domain));

  const storedSettings = await settingsRepo.getSettings(createResult.tenant.id);
  assert.equal(storedSettings.tenantId, createResult.tenant.id);
  assert.equal(storedSettings.contactWhatsappE164, null);
  assert.deepEqual(storedSettings.socialLinks, {});

  const updatedSettings = await settingsRepo.upsertSettings(createResult.tenant.id, {
    contactName: 'Tenant Support',
    contactEmail: 'support@test-tenant.ug',
    contactPhoneE164: '+256712345678',
    contactWhatsappE164: '+256772345678',
    socialLinks: {
      website: 'https://test-tenant.ug'
    },
    businessHours: {
      monday: {
        closed: false,
        open: '08:00',
        close: '17:00'
      }
    }
  });
  assert.equal(updatedSettings.contactName, 'Tenant Support');
  assert.equal(updatedSettings.contactWhatsappE164, '+256772345678');
  assert.deepEqual(updatedSettings.socialLinks, {
    website: 'https://test-tenant.ug'
  });

  const reloadedSettings = await settingsRepo.getSettings(createResult.tenant.id);
  assert.equal(reloadedSettings.contactEmail, 'support@test-tenant.ug');
  assert.equal(reloadedSettings.contactPhoneE164, '+256712345678');
  assert.deepEqual(reloadedSettings.businessHours, {
    monday: {
      closed: false,
      open: '08:00',
      close: '17:00'
    }
  });

  await db
    .insertInto('users')
    .values({
      id: staffUserId,
      phone_e164: `+256703${uuidSuffix.slice(-6)}`,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  const createdMembership = await membershipRepo.createMembership(
    createResult.tenant.id,
    staffUserId,
    'staff'
  );
  assert.equal(createdMembership.userId, staffUserId);
  assert.equal(createdMembership.role, 'staff');
  assert.equal(createdMembership.status, 'active');
  assert.equal(createdMembership.revokedAt, null);

  const fetchedCreatedMembership = await membershipRepo.getMembership(
    createResult.tenant.id,
    staffUserId
  );
  assert.ok(fetchedCreatedMembership);
  assert.equal(fetchedCreatedMembership.role, 'staff');

  const updatedMembership = await membershipRepo.updateRole(
    createResult.tenant.id,
    staffUserId,
    'manager'
  );
  assert.ok(updatedMembership);
  assert.equal(updatedMembership.role, 'manager');
  assert.equal(updatedMembership.status, 'active');

  const updatedMembershipReloaded = await membershipRepo.getMembership(
    createResult.tenant.id,
    staffUserId
  );
  assert.ok(updatedMembershipReloaded);
  assert.equal(updatedMembershipReloaded.role, 'manager');

  await db
    .insertInto('users')
    .values({
      id: secondOwnerUserId,
      phone_e164: `+256704${uuidSuffix.slice(-6)}`,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await membershipRepo.createMembership(createResult.tenant.id, secondOwnerUserId, 'owner');
  const activeOwnersAfterSecondOwner = await membershipRepo.listActiveOwners(
    createResult.tenant.id
  );
  assert.equal(activeOwnersAfterSecondOwner.length, 2);
  assert.ok(activeOwnersAfterSecondOwner.some((item) => item.userId === secondOwnerUserId));

  const revokedMembership = await membershipRepo.revokeMembership(
    createResult.tenant.id,
    staffUserId,
    ownerUserId
  );
  assert.ok(revokedMembership);
  assert.equal(revokedMembership.status, 'revoked');
  assert.ok(revokedMembership.revokedAt instanceof Date);

  const revokedMembershipReloaded = await membershipRepo.getMembership(
    createResult.tenant.id,
    staffUserId
  );
  assert.ok(revokedMembershipReloaded);
  assert.equal(revokedMembershipReloaded.status, 'revoked');
  assert.ok(revokedMembershipReloaded.revokedAt instanceof Date);

  const auditRows = await db
    .selectFrom('audit_events')
    .select(['action', 'target_id'])
    .where('action', '=', 'tenant.created')
    .where('target_id', '=', createResult.tenant.id)
    .execute();
  assert.equal(auditRows.length, 1);

  const otherList = await tenantRepo.listForUser(observerUserId);
  assert.ok(otherList.every((item) => item.id !== createResult.tenant.id));

  let missingThrown: unknown;
  try {
    await resolver.resolveByDomain(`missing-${stamp}.${config.platformRootDomain}`);
  } catch (error) {
    missingThrown = error;
  }
  assert.ok(missingThrown instanceof TenancyError);
  assert.equal((missingThrown as TenancyError).code, ErrorCode.TenantDomainNotFound);

  await db
    .updateTable('tenants')
    .set({ status: 'suspended' })
    .where('id', '=', createResult.tenant.id)
    .execute();

  let suspendedThrown: unknown;
  try {
    await resolver.resolveByDomain(domain);
  } catch (error) {
    suspendedThrown = error;
  }
  assert.ok(suspendedThrown instanceof TenancyError);
  assert.equal((suspendedThrown as TenancyError).code, ErrorCode.TenantSuspended);

  await db
    .updateTable('tenants')
    .set({ status: 'active' })
    .where('id', '=', createResult.tenant.id)
    .execute();

  const beforeCounts = {
    tenants: await db.selectFrom('tenants').select('id').execute(),
    domains: await db.selectFrom('tenant_domains').select('id').execute(),
    memberships: await db.selectFrom('tenant_memberships').select('id').execute(),
    settings: await db.selectFrom('tenant_settings').select('tenant_id').execute(),
    audits: await db
      .selectFrom('audit_events')
      .select('id')
      .where('action', '=', 'tenant.created')
      .execute()
  };

  let thrown: unknown;
  try {
    await createTenantUseCase.execute({
      businessName: 'Duplicate Slug Tenant',
      slug,
      ownerUserId,
      requestId: `tenant-create-duplicate-${stamp}`
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof TenancyError);
  assert.equal((thrown as TenancyError).code, ErrorCode.TenantSlugTaken);

  const afterCounts = {
    tenants: await db.selectFrom('tenants').select('id').execute(),
    domains: await db.selectFrom('tenant_domains').select('id').execute(),
    memberships: await db.selectFrom('tenant_memberships').select('id').execute(),
    settings: await db.selectFrom('tenant_settings').select('tenant_id').execute(),
    audits: await db
      .selectFrom('audit_events')
      .select('id')
      .where('action', '=', 'tenant.created')
      .execute()
  };

  assert.equal(afterCounts.tenants.length, beforeCounts.tenants.length);
  assert.equal(afterCounts.domains.length, beforeCounts.domains.length);
  assert.equal(afterCounts.memberships.length, beforeCounts.memberships.length);
  assert.equal(afterCounts.settings.length, beforeCounts.settings.length);
  assert.equal(afterCounts.audits.length, beforeCounts.audits.length);

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
