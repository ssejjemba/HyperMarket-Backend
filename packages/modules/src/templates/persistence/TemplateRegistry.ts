import { ErrorCode } from '@hypermarket/contracts';
import { z } from 'zod';

import type {
  TemplateDefinition,
  TemplateJsonSchema,
  TemplateVersionDefinition
} from '../domain/TemplateTypes';
import { TemplateError } from '../errors/TemplateError';

const basicCommerceConfigSchema = z
  .object({
    brand_name: z.string().min(1, 'Brand name is required'),
    hero_title: z.string().min(1, 'Hero title is required'),
    hero_subtitle: z.string().min(1, 'Hero subtitle is required'),
    primary_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a 6-digit hex code'),
    cta_label: z.string().min(1, 'CTA label is required')
  })
  .strict();

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
        configSchema: basicCommerceConfigSchema,
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
  listTemplates: () => registry.map((template) => cloneTemplateDefinition(template)),
  listVersions: (templateId) =>
    getTemplate(templateId).versions.map((version) => cloneTemplateVersionDefinition(version)),
  getTemplate: (templateId) => cloneTemplateDefinition(getTemplate(templateId)),
  getVersion: (templateId, version) =>
    cloneTemplateVersionDefinition(getVersion(templateId, version))
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

const cloneTemplateDefinition = (template: TemplateDefinition): TemplateDefinition => ({
  templateId: template.templateId,
  name: template.name,
  description: template.description,
  versions: template.versions.map((version) => cloneTemplateVersionDefinition(version))
});

const cloneTemplateVersionDefinition = (
  version: TemplateVersionDefinition
): TemplateVersionDefinition => ({
  templateVersion: version.templateVersion,
  configSchema: version.configSchema,
  schema: structuredClone(version.schema),
  defaultConfigPayload: structuredClone(version.defaultConfigPayload)
});
