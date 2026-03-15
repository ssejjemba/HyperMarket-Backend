export type Tenant = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  status: 'active' | 'suspended' | 'archived';
  defaultCurrency: string;
  activeConfigId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantMembership = {
  tenantId: string;
  role: string;
  isActive: boolean;
  status: 'active' | 'revoked';
};

export type TenantSettings = {
  tenantId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhoneE164: string | null;
  contactWhatsappE164: string | null;
  socialLinks: Record<string, unknown>;
  businessHours: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
