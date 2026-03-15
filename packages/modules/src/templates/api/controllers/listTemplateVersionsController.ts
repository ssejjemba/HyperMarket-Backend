import type { FastifyRequest } from 'fastify';

import type { ListTemplateVersionsUseCase } from '../../application/ListTemplateVersionsUseCase';
import { parseTemplateIdParams } from '../schemas/templateSchemas';

export type ListTemplateVersionsResponse = {
  template: {
    template_id: string;
    name: string;
    versions: {
      template_version: string;
      default_config_payload: Record<string, unknown>;
    }[];
  };
};

export const makeListTemplateVersionsHandler =
  (useCase: ListTemplateVersionsUseCase) =>
  async (request: FastifyRequest): Promise<ListTemplateVersionsResponse> => {
    const { templateId } = parseTemplateIdParams(request.params);
    const template = useCase.execute(templateId);

    return {
      template: {
        template_id: template.templateId,
        name: template.name,
        versions: template.versions.map((version) => ({
          template_version: version.templateVersion,
          default_config_payload: version.defaultConfigPayload
        }))
      }
    };
  };
