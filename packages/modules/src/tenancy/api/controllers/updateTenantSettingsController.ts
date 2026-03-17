import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../../errors/TenancyError';
import type { UpdateTenantSettingsUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import { updateTenantSettingsSchema } from '../schemas/tenantSchemas';
import type { GetTenantSettingsResponse } from './getTenantSettingsController';

export const makeUpdateTenantSettingsHandler =
  (useCase: UpdateTenantSettingsUseCase) =>
  async (request: ModuleRequest): Promise<GetTenantSettingsResponse> => {
    const tenantId = request.tenant?.tenantId;
    const userId = request.auth?.userId;
    if (tenantId === undefined || userId === undefined) {
      throw new Error('tenant and auth context are required');
    }

    let parsedBody: ReturnType<typeof updateTenantSettingsSchema.parse>;
    try {
      parsedBody = updateTenantSettingsSchema.parse(request.body);
    } catch (error) {
      if (error instanceof TenancyError) {
        throw error;
      }

      throw new TenancyError({
        code: ErrorCode.TenantSettingsInvalid,
        message: 'Tenant settings payload is invalid'
      });
    }

    const settings = await useCase.execute({
      tenantId,
      actorUserId: userId,
      patch: {
        ...(parsedBody.contactName !== undefined ? { contactName: parsedBody.contactName } : {}),
        ...(parsedBody.contactEmail !== undefined ? { contactEmail: parsedBody.contactEmail } : {}),
        ...(parsedBody.contactPhoneE164 !== undefined
          ? { contactPhoneE164: parsedBody.contactPhoneE164 }
          : {}),
        ...(parsedBody.contactWhatsappE164 !== undefined
          ? { contactWhatsappE164: parsedBody.contactWhatsappE164 }
          : {}),
        ...(parsedBody.socialLinks !== undefined ? { socialLinks: parsedBody.socialLinks } : {}),
        ...(parsedBody.businessHours !== undefined
          ? { businessHours: parsedBody.businessHours }
          : {})
      },
      requestId: request.id
    });

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
