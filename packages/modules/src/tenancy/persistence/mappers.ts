import type { DatabaseSchema } from '@hypermarket/core';

import type { MembershipClaim } from '../domain/MembershipClaim';
import type { Tenant, TenantMembership, TenantSettings } from '../domain/Tenant';
import type { TenantDomain } from './TenantDomainRepository';
import type { TenantMembershipRecord } from './TenantMembershipRepository';

export const mapTenantRow = (row: DatabaseSchema['tenants']): Tenant => ({
  id: row.id,
  name: row.business_name,
  slug: row.slug,
  isActive: row.status === 'active',
  status: row.status,
  defaultCurrency: row.default_currency,
  activeConfigId: row.active_config_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const mapMembershipRecord = (
  row: Pick<
    DatabaseSchema['tenant_memberships'],
    'tenant_id' | 'user_id' | 'role' | 'status' | 'created_at'
  >
): TenantMembershipRecord => ({
  tenantId: row.tenant_id,
  userId: row.user_id,
  role: row.role,
  status: row.status,
  isActive: row.status === 'active',
  createdAt: row.created_at
});

export const mapMembership = (row: TenantMembershipRecord): TenantMembership => ({
  tenantId: row.tenantId,
  role: row.role,
  status: row.status,
  isActive: row.isActive
});

export const mapMembershipClaim = (row: TenantMembershipRecord): MembershipClaim => ({
  tenantId: row.tenantId,
  role: row.role,
  status: row.status
});

export const mapTenantDomainRow = (
  row: Pick<
    DatabaseSchema['tenant_domains'],
    | 'id'
    | 'tenant_id'
    | 'domain'
    | 'domain_type'
    | 'verification_status'
    | 'is_primary'
    | 'created_at'
  >
): TenantDomain => ({
  id: row.id,
  tenantId: row.tenant_id,
  domain: row.domain,
  type: row.domain_type,
  verificationStatus: row.verification_status,
  isPrimary: row.is_primary,
  createdAt: row.created_at
});

export const mapTenantSettingsRow = (row: DatabaseSchema['tenant_settings']): TenantSettings => ({
  tenantId: row.tenant_id,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  contactPhoneE164: row.contact_phone_e164,
  contactWhatsappE164: row.contact_whatsapp_e164,
  socialLinks: row.social_links,
  businessHours: row.business_hours,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
