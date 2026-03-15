import type { FastifyRequest } from 'fastify';

import type { ListTemplatesUseCase } from '../../application/ListTemplatesUseCase';

export type ListTemplatesResponse = {
  templates: {
    template_id: string;
    name: string;
    description: string;
    versions: string[];
  }[];
};

export const makeListTemplatesHandler =
  (useCase: ListTemplatesUseCase) =>
  async (_request: FastifyRequest): Promise<ListTemplatesResponse> => ({
    templates: useCase.execute().map((template) => ({
      template_id: template.templateId,
      name: template.name,
      description: template.description,
      versions: template.versions
    }))
  });
