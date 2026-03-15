export type TemplateJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, Record<string, unknown>>;
};

export type TemplateVersionDefinition = {
  templateVersion: string;
  schema: TemplateJsonSchema;
  defaultConfigPayload: Record<string, unknown>;
};

export type TemplateDefinition = {
  templateId: string;
  name: string;
  description: string;
  versions: TemplateVersionDefinition[];
};
