import { ErrorCode } from '@hypermarket/contracts';

import type {
  TemplateDefinition,
  TemplateJsonSchema,
  TemplateVersionDefinition
} from '../domain/TemplateTypes';
import { TemplateError } from '../errors/TemplateError';

const basicCommerceSchema: TemplateJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['brand_name', 'hero_title', 'hero_subtitle', 'primary_color', 'cta_label'],
  properties: {
    brand_name: {
      type: 'string',
      minLength: 1,
      title: 'Brand Name'
    },
    hero_title: {
      type: 'string',
      minLength: 1,
      title: 'Hero Title'
    },
    hero_subtitle: {
      type: 'string',
      minLength: 1,
      title: 'Hero Subtitle'
    },
    primary_color: {
      type: 'string',
      pattern: '^#[0-9A-Fa-f]{6}$',
      title: 'Primary Color'
    },
    cta_label: {
      type: 'string',
      minLength: 1,
      title: 'Call To Action Label'
    }
  }
};

const registry: TemplateDefinition[] = [
  {
    templateId: 'basic-commerce',
    name: 'Basic Commerce',
    description: 'Starter storefront template for a single-tenant retail catalog.',
    versions: [
      {
        templateVersion: 'v1',
        schema: basicCommerceSchema,
        defaultConfigPayload: {
          brand_name: 'My Shop',
          hero_title: 'Fresh products for Kampala',
          hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
          primary_color: '#0B6E4F',
          cta_label: 'Shop now'
        }
      }
    ]
  }
];

export type TemplateRegistry = {
  listTemplates(): TemplateDefinition[];
  listVersions(templateId: string): TemplateVersionDefinition[];
  getTemplate(templateId: string): TemplateDefinition;
  getVersion(templateId: string, version: string): TemplateVersionDefinition;
};

export const createTemplateRegistry = (): TemplateRegistry => ({
  listTemplates: () => registry.map((template) => structuredClone(template)),
  listVersions: (templateId) =>
    getTemplate(templateId).versions.map((version) => structuredClone(version)),
  getTemplate: (templateId) => structuredClone(getTemplate(templateId)),
  getVersion: (templateId, version) => structuredClone(getVersion(templateId, version))
});

const getTemplate = (templateId: string): TemplateDefinition => {
  const template = registry.find((candidate) => candidate.templateId === templateId);
  if (template === undefined) {
    throw new TemplateError({
      code: ErrorCode.TemplateNotFound,
      message: 'Template not found',
      details: { template_id: templateId }
    });
  }

  return template;
};

const getVersion = (templateId: string, version: string): TemplateVersionDefinition => {
  const template = getTemplate(templateId);
  const templateVersion = template.versions.find(
    (candidate) => candidate.templateVersion === version
  );
  if (templateVersion === undefined) {
    throw new TemplateError({
      code: ErrorCode.TemplateVersionNotFound,
      message: 'Template version not found',
      details: { template_id: templateId, version }
    });
  }

  return templateVersion;
};
