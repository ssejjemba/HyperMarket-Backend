import type { FastifyRequest } from 'fastify';

import type { GetTemplateSchemaUseCase } from '../../application/GetTemplateSchemaUseCase';
import { parseTemplateVersionParams } from '../schemas/templateSchemas';

export type GetTemplateSchemaResponse = {
  template: {
    template_id: string;
    template_version: string;
    schema: Record<string, unknown>;
    default_config_payload: Record<string, unknown>;
  };
};

export const makeGetTemplateSchemaHandler =
  (useCase: GetTemplateSchemaUseCase) =>
  async (request: FastifyRequest): Promise<GetTemplateSchemaResponse> => {
    const { templateId, version } = parseTemplateVersionParams(request.params);
    const templateVersion = useCase.execute(templateId, version);

    return {
      template: {
        template_id: templateVersion.templateId,
        template_version: templateVersion.templateVersion,
        schema: templateVersion.schema,
        default_config_payload: templateVersion.defaultConfigPayload
      }
    };
  };
