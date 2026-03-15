import type { TemplateRegistry } from '../persistence/TemplateRegistry';

export type GetTemplateSchemaUseCase = {
  execute(
    templateId: string,
    version: string
  ): {
    templateId: string;
    templateVersion: string;
    schema: Record<string, unknown>;
    defaultConfigPayload: Record<string, unknown>;
  };
};

export const createGetTemplateSchemaUseCase = (
  templateRegistry: TemplateRegistry
): GetTemplateSchemaUseCase => ({
  execute: (templateId, version) => {
    const templateVersion = templateRegistry.getVersion(templateId, version);

    return {
      templateId,
      templateVersion: version,
      schema: templateVersion.schema,
      defaultConfigPayload: templateVersion.defaultConfigPayload
    };
  }
});
