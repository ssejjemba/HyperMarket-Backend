export type Tenant = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantMembership = {
  tenantId: string;
  role: string;
  isActive: boolean;
};

export type TenantSettings = Record<string, unknown>;
