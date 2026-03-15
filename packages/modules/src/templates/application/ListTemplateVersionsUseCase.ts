import type { TemplateRegistry } from '../persistence/TemplateRegistry';

export type ListTemplateVersionsUseCase = {
  execute(templateId: string): {
    templateId: string;
    name: string;
    versions: {
      templateVersion: string;
      defaultConfigPayload: Record<string, unknown>;
    }[];
  };
};

export const createListTemplateVersionsUseCase = (
  templateRegistry: TemplateRegistry
): ListTemplateVersionsUseCase => ({
  execute: (templateId) => {
    const template = templateRegistry.getTemplate(templateId);

    return {
      templateId: template.templateId,
      name: template.name,
      versions: template.versions.map((version) => ({
        templateVersion: version.templateVersion,
        defaultConfigPayload: version.defaultConfigPayload
      }))
    };
  }
});
