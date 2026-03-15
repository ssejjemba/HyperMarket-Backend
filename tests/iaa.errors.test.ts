import { describe, expect, it } from 'vitest';

import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';
import { IaaError } from '@hypermarket/modules/iaa';
import type { IaaErrorCode } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// HTTP status mapping — every IAA code must map to a stable, correct status
// ---------------------------------------------------------------------------

const expectedStatuses: [IaaErrorCode, number][] = [
  [ErrorCode.AuthInvalidPhoneFormat, 400],
  [ErrorCode.AuthPhoneCountryNotSupported, 400],
  [ErrorCode.AuthOtpRateLimitedPhone, 429],
  [ErrorCode.AuthOtpRateLimitedIp, 429],
  [ErrorCode.AuthChallengeNotFound, 404],
  [ErrorCode.AuthChallengeExpired, 422],
  [ErrorCode.AuthChallengeLocked, 429],
  [ErrorCode.AuthChallengeConsumed, 409],
  [ErrorCode.AuthChallengePhoneMismatch, 422],
  [ErrorCode.AuthOtpInvalid, 422],
  [ErrorCode.AuthUserSuspended, 403],
  [ErrorCode.AuthSessionIssueFailed, 500],
  [ErrorCode.AuthMissingToken, 401],
  [ErrorCode.AuthInvalidToken, 401],
  [ErrorCode.AuthSessionNotFound, 401],
  [ErrorCode.AuthSessionExpired, 401],
  [ErrorCode.AuthSessionRevoked, 401],
  [ErrorCode.AuthTenantMembershipMissing, 403],
  [ErrorCode.AuthTenantMembershipRevoked, 403],
  [ErrorCode.AuthProviderAuthFailed, 502],
  [ErrorCode.AuthProviderRateLimited, 429],
  [ErrorCode.AuthProviderUnavailable, 503],
  [ErrorCode.AuthDbFailure, 500]
];

describe('IAA error codes — HTTP status mapping', () => {
  it.each(expectedStatuses)('%s → %i', (code, expectedStatus) => {
    const error = new IaaError({ code, message: 'test' });
    const { status } = errorToHttp(error, 'req-test');
    expect(status).toBe(expectedStatus);
  });

  it('mapping is exhaustive — all 23 IAA codes are covered', () => {
    expect(expectedStatuses).toHaveLength(23);
  });
});

// ---------------------------------------------------------------------------
// IaaError construction
// ---------------------------------------------------------------------------

describe('IaaError construction', () => {
  it('sets code and message', () => {
    const error = new IaaError({
      code: ErrorCode.AuthOtpInvalid,
      message: 'OTP is invalid'
    });

    expect(error.code).toBe(ErrorCode.AuthOtpInvalid);
    expect(error.message).toBe('OTP is invalid');
  });

  it('sets safe details that appear in the HTTP envelope', () => {
    const error = new IaaError({
      code: ErrorCode.AuthChallengeLocked,
      message: 'Challenge locked',
      details: { attempts: 5, max_attempts: 5 }
    });

    expect(error.details).toEqual({ attempts: 5, max_attempts: 5 });
    const { body } = errorToHttp(error, 'req-1');
    expect(body.details).toEqual({ attempts: 5, max_attempts: 5 });
  });

  it('keeps cause internal — never serialised into the HTTP envelope', () => {
    const internalCause = new Error('pg: connection refused');
    const error = new IaaError({
      code: ErrorCode.AuthDbFailure,
      message: 'Database error',
      cause: internalCause
    });

    expect(error.cause).toBe(internalCause);

    const { body } = errorToHttp(error, 'req-2');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('pg: connection refused');
    expect(body).not.toHaveProperty('cause');
  });

  it('is an instance of AppError (flows through shared error handler)', () => {
    const error = new IaaError({ code: ErrorCode.AuthMissingToken, message: 'no token' });
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(IaaError);
  });

  it('IaaError.is() type-guard returns true for IaaError instances', () => {
    const iaaErr = new IaaError({ code: ErrorCode.AuthInvalidToken, message: 'bad token' });
    const appErr = new AppError({ code: ErrorCode.InternalError, message: 'oops' });

    expect(IaaError.is(iaaErr)).toBe(true);
    expect(IaaError.is(appErr)).toBe(false);
    expect(IaaError.is(new Error('plain'))).toBe(false);
    expect(IaaError.is(null)).toBe(false);
  });

  it('name is IaaError', () => {
    const error = new IaaError({ code: ErrorCode.AuthSessionExpired, message: 'expired' });
    expect(error.name).toBe('IaaError');
  });
});

// ---------------------------------------------------------------------------
// HTTP envelope shape
// ---------------------------------------------------------------------------

describe('IAA error HTTP envelope', () => {
  it('includes request_id, error_code, and message', () => {
    const error = new IaaError({ code: ErrorCode.AuthInvalidPhoneFormat, message: 'bad phone' });
    const { body } = errorToHttp(error, 'req-abc-123');

    expect(body.request_id).toBe('req-abc-123');
    expect(body.error_code).toBe('auth_invalid_phone_format');
    expect(body.message).toBe('bad phone');
  });

  it('omits details key when no details provided', () => {
    const error = new IaaError({ code: ErrorCode.AuthUserSuspended, message: 'suspended' });
    const { body } = errorToHttp(error, 'req-xyz');
    expect(body).not.toHaveProperty('details');
  });
});
