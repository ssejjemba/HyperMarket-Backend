import type { FastifyRequest } from 'fastify';

import type { GetTenantSettingsUseCase } from '../../application';

export type GetTenantSettingsResponse = {
  tenant_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  social_links: Record<string, unknown>;
  business_hours: Record<string, unknown>;
  updated_at: string;
};

export const makeGetTenantSettingsHandler =
  (useCase: GetTenantSettingsUseCase) =>
  async (request: FastifyRequest): Promise<GetTenantSettingsResponse> => {
    const tenantId = request.tenant?.tenantId;
    if (tenantId === undefined) {
      throw new Error('tenant context is required');
    }

    const settings = await useCase.execute(tenantId);

    return {
      tenant_id: settings.tenantId,
      contact_name: settings.contactName,
      contact_email: settings.contactEmail,
      contact_phone: settings.contactPhoneE164,
      contact_whatsapp: settings.contactWhatsappE164,
      social_links: settings.socialLinks,
      business_hours: settings.businessHours,
      updated_at: settings.updatedAt.toISOString()
    };
  };
