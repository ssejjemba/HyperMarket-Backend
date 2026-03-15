import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { PublishingError, createConfigValidator } from '@hypermarket/modules/publishing';
import { TemplateError, createTemplateRegistry } from '@hypermarket/modules/templates';

describe('ConfigValidator', () => {
  const registry = createTemplateRegistry();
  const validator = createConfigValidator(registry);

  it('accepts the default template payload', () => {
    const version = registry.getVersion('basic-commerce', 'v1');

    expect(
      validator.validate('basic-commerce', 'v1', structuredClone(version.defaultConfigPayload))
    ).toEqual({
      isValid: true,
      errors: []
    });
  });

  it('returns deterministic validation errors for missing required fields', () => {
    const report = validator.validate('basic-commerce', 'v1', {
      hero_title: 'Fresh products for Kampala',
      hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
      primary_color: '#0B6E4F',
      cta_label: 'Shop now'
    });

    expect(report).toEqual({
      isValid: false,
      errors: [
        {
          path: '/brand_name',
          code: 'invalid_type',
          message: 'Required'
        }
      ]
    });
  });

  it('throws a template error for an unknown template or version', () => {
    expect(() => validator.validate('missing-template', 'v1', {})).toThrowError(TemplateError);
    expect(() => validator.validate('basic-commerce', 'v9', {})).toThrowError(TemplateError);
  });

  it('throws a publishing error when payload is not an object', () => {
    expect(() => validator.validate('basic-commerce', 'v1', 'invalid')).toThrowError(
      PublishingError
    );
    expect(() => validator.validate('basic-commerce', 'v1', 'invalid')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.ConfigSchemaMismatch,
        details: {
          template_id: 'basic-commerce',
          template_version: 'v1'
        }
      })
    );
  });
});
