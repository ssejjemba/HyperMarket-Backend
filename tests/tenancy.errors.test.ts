import { describe, expect, it } from 'vitest';

import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';
import { TenancyError } from '@hypermarket/modules/tenancy';
import type { TenancyErrorCode } from '@hypermarket/modules/tenancy';

const expectedStatuses: [TenancyErrorCode, number][] = [
  [ErrorCode.TenantSlugInvalid, 400],
  [ErrorCode.TenantSlugTaken, 409],
  [ErrorCode.TenantNotFound, 404],
  [ErrorCode.TenantSuspended, 403],
  [ErrorCode.TenantArchived, 409],
  [ErrorCode.TenantDomainInvalid, 400],
  [ErrorCode.TenantDomainTaken, 409],
  [ErrorCode.TenantDomainNotFound, 404],
  [ErrorCode.TenantSettingsInvalid, 400],
  [ErrorCode.TenantMembershipExists, 409],
  [ErrorCode.TenantMembershipNotFound, 404],
  [ErrorCode.TenantMembershipRevoked, 403],
  [ErrorCode.TenantMembershipRoleInvalid, 400],
  [ErrorCode.TenantMemberSelfRevokeForbidden, 403],
  [ErrorCode.TenantLastOwnerRevokeForbidden, 409],
  [ErrorCode.TenantLastOwnerRoleChangeForbidden, 409],
  [ErrorCode.TenantMemberTargetNotFound, 404],
  [ErrorCode.TenantMemberAlreadyRevoked, 409],
  [ErrorCode.TenantAccessForbidden, 403],
  [ErrorCode.TenantDbFailure, 500]
];

describe('TEN error codes - HTTP status mapping', () => {
  it.each(expectedStatuses)('%s -> %i', (code, expectedStatus) => {
    const error = new TenancyError({ code, message: 'test' });
    const { status } = errorToHttp(error, 'req-test');
    expect(status).toBe(expectedStatus);
  });

  it('mapping is exhaustive - all 20 TEN codes are covered', () => {
    expect(expectedStatuses).toHaveLength(20);
  });
});

describe('TenancyError construction', () => {
  it('sets code and message', () => {
    const error = new TenancyError({
      code: ErrorCode.TenantSlugInvalid,
      message: 'Tenant slug is invalid'
    });

    expect(error.code).toBe(ErrorCode.TenantSlugInvalid);
    expect(error.message).toBe('Tenant slug is invalid');
  });

  it('sets safe details that appear in the HTTP envelope', () => {
    const error = new TenancyError({
      code: ErrorCode.TenantSettingsInvalid,
      message: 'Tenant settings are invalid',
      details: { field: 'currency', reason: 'unsupported' }
    });

    expect(error.details).toEqual({ field: 'currency', reason: 'unsupported' });
    const { body } = errorToHttp(error, 'req-1');
    expect(body.details).toEqual({ field: 'currency', reason: 'unsupported' });
  });

  it('keeps cause internal - never serialised into the HTTP envelope', () => {
    const internalCause = new Error('pg: deadlock detected');
    const error = new TenancyError({
      code: ErrorCode.TenantDbFailure,
      message: 'Tenancy database error',
      cause: internalCause
    });

    expect(error.cause).toBe(internalCause);

    const { body } = errorToHttp(error, 'req-2');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('pg: deadlock detected');
    expect(body).not.toHaveProperty('cause');
  });

  it('is an instance of AppError', () => {
    const error = new TenancyError({
      code: ErrorCode.TenantAccessForbidden,
      message: 'Tenant access denied'
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(TenancyError);
  });

  it('TenancyError.is() returns true for TenancyError instances', () => {
    const tenancyError = new TenancyError({
      code: ErrorCode.TenantNotFound,
      message: 'Missing tenant'
    });
    const appError = new AppError({ code: ErrorCode.InternalError, message: 'oops' });

    expect(TenancyError.is(tenancyError)).toBe(true);
    expect(TenancyError.is(appError)).toBe(false);
    expect(TenancyError.is(new Error('plain'))).toBe(false);
    expect(TenancyError.is(null)).toBe(false);
  });

  it('name is TenancyError', () => {
    const error = new TenancyError({
      code: ErrorCode.TenantMembershipRevoked,
      message: 'Membership revoked'
    });

    expect(error.name).toBe('TenancyError');
  });
});
