import type { ZodType } from 'zod';

export type TemplateJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, Record<string, unknown>>;
};

export type TemplateVersionDefinition = {
  templateVersion: string;
  configSchema: ZodType<Record<string, unknown>>;
  schema: TemplateJsonSchema;
  defaultConfigPayload: Record<string, unknown>;
};

export type TemplateDefinition = {
  templateId: string;
  name: string;
  description: string;
  versions: TemplateVersionDefinition[];
};
