import { describe, expect, it } from 'vitest';

import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';
import { PublishingError } from '@hypermarket/modules/publishing';
import type { PublishingErrorCode } from '@hypermarket/modules/publishing';
import { TemplateError } from '@hypermarket/modules/templates';
import type { TemplateErrorCode } from '@hypermarket/modules/templates';

const expectedTemplateStatuses: [TemplateErrorCode, number][] = [
  [ErrorCode.TemplateNotFound, 404],
  [ErrorCode.TemplateVersionNotFound, 404]
];

const expectedPublishingStatuses: [PublishingErrorCode, number][] = [
  [ErrorCode.ConfigInvalidPayload, 400],
  [ErrorCode.ConfigSchemaMismatch, 400],
  [ErrorCode.ConfigNotFound, 404],
  [ErrorCode.ConfigNotOwnedByTenant, 404],
  [ErrorCode.ConfigAlreadyActive, 409],
  [ErrorCode.ConfigNotDraft, 409],
  [ErrorCode.ConfigVersionConflict, 409],
  [ErrorCode.PublishValidationFailed, 400],
  [ErrorCode.PublishFailed, 500],
  [ErrorCode.RollbackFailed, 500],
  [ErrorCode.RevalidationDispatchFailed, 502]
];

describe('TMP/PUB error codes - HTTP status mapping', () => {
  it.each(expectedTemplateStatuses)('template %s -> %i', (code, expectedStatus) => {
    const error = new TemplateError({ code, message: 'test' });
    const { status } = errorToHttp(error, 'req-template');
    expect(status).toBe(expectedStatus);
  });

  it.each(expectedPublishingStatuses)('publishing %s -> %i', (code, expectedStatus) => {
    const error = new PublishingError({ code, message: 'test' });
    const { status } = errorToHttp(error, 'req-publishing');
    expect(status).toBe(expectedStatus);
  });
});

describe('TemplateError construction', () => {
  it('is an AppError and preserves details without leaking cause', () => {
    const cause = new Error('internal template error');
    const error = new TemplateError({
      code: ErrorCode.TemplateVersionNotFound,
      message: 'Template version missing',
      details: { template_id: 'basic-commerce', version: 'v9' },
      cause
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(TemplateError);
    expect(error.details).toEqual({ template_id: 'basic-commerce', version: 'v9' });
    expect(error.cause).toBe(cause);
    expect(errorToHttp(error, 'req-template').body).not.toHaveProperty('cause');
  });
});

describe('PublishingError construction', () => {
  it('is an AppError and preserves details without leaking cause', () => {
    const cause = new Error('internal publishing error');
    const error = new PublishingError({
      code: ErrorCode.ConfigInvalidPayload,
      message: 'Config payload is invalid',
      details: { path: '/hero/title', code: 'required' },
      cause
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(PublishingError);
    expect(error.details).toEqual({ path: '/hero/title', code: 'required' });
    expect(error.cause).toBe(cause);
    expect(errorToHttp(error, 'req-publishing').body).not.toHaveProperty('cause');
  });
});
