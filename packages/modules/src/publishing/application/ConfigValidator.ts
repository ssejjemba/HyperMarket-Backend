import { ErrorCode } from '@hypermarket/contracts';

import type { TemplateRegistry } from '../../templates';
import type { ValidationReport } from '../domain';
import { PublishingError } from '../errors/PublishingError';

export type ConfigValidator = {
  validate: (templateId: string, templateVersion: string, payload: unknown) => ValidationReport;
};

export const createConfigValidator = (templateRegistry: TemplateRegistry): ConfigValidator => ({
  validate: (templateId, templateVersion, payload) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new PublishingError({
        code: ErrorCode.ConfigSchemaMismatch,
        message: 'Config payload must be a JSON object',
        details: {
          template_id: templateId,
          template_version: templateVersion
        }
      });
    }

    const templateVersionDefinition = templateRegistry.getVersion(templateId, templateVersion);
    const parsed = templateVersionDefinition.configSchema.safeParse(payload);

    if (parsed.success) {
      return {
        isValid: true,
        errors: []
      };
    }

    return {
      isValid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: toJsonPointer(issue.path),
        code: issue.code,
        message: issue.message
      }))
    };
  }
});

const toJsonPointer = (segments: Array<string | number>): string => {
  if (segments.length === 0) {
    return '/';
  }

  return `/${segments
    .map((segment) => `${segment}`.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/')}`;
};
