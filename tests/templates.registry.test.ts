import { describe, expect, it } from 'vitest';

import { TemplateError, createTemplateRegistry } from '@hypermarket/modules/templates';

describe('TemplateRegistry', () => {
  it('returns the expected template ids and versions', () => {
    const registry = createTemplateRegistry();

    expect(
      registry.listTemplates().map((template) => ({
        templateId: template.templateId,
        versions: template.versions.map((version) => version.templateVersion)
      }))
    ).toEqual([{ templateId: 'basic-commerce', versions: ['v1'] }]);
  });

  it('throws a typed error for a missing template', () => {
    const registry = createTemplateRegistry();

    expect(() => registry.getTemplate('missing')).toThrowError(TemplateError);
    expect(() => registry.getTemplate('missing')).toThrowError(
      expect.objectContaining({
        code: 'template_not_found',
        details: { template_id: 'missing' }
      })
    );
  });

  it('throws a typed error for a missing template version', () => {
    const registry = createTemplateRegistry();

    expect(() => registry.getVersion('basic-commerce', 'v9')).toThrowError(TemplateError);
    expect(() => registry.getVersion('basic-commerce', 'v9')).toThrowError(
      expect.objectContaining({
        code: 'template_version_not_found',
        details: { template_id: 'basic-commerce', version: 'v9' }
      })
    );
  });
});
