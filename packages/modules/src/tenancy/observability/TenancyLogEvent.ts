export type TenancyLogEvent =
  | 'tenancy.create_tenant.not_implemented'
  | 'tenancy.list_tenants.not_implemented'
  | 'tenancy.get_tenant.not_implemented'
  | 'tenancy.get_tenant_settings.not_implemented'
  | 'tenancy.update_tenant_settings.not_implemented'
  | 'tenancy.list_tenant_memberships.not_implemented'
  | 'tenancy.revoke_tenant_membership.not_implemented';
