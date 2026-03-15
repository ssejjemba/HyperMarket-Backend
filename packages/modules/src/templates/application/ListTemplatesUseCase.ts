import type { TemplateRegistry } from '../persistence/TemplateRegistry';

export type ListTemplatesUseCase = {
  execute(): {
    templateId: string;
    name: string;
    description: string;
    versions: string[];
  }[];
};

export const createListTemplatesUseCase = (
  templateRegistry: TemplateRegistry
): ListTemplatesUseCase => ({
  execute: () =>
    templateRegistry.listTemplates().map((template) => ({
      templateId: template.templateId,
      name: template.name,
      description: template.description,
      versions: template.versions.map((version) => version.templateVersion)
    }))
});
