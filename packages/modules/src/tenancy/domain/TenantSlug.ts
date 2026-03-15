import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../errors/TenancyError';

const TENANT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TENANT_SLUG_MIN_LENGTH = 3;
const TENANT_SLUG_MAX_LENGTH = 63;

export class TenantSlug {
  private constructor(private readonly value: string) {}

  static parse(input: string): TenantSlug {
    if (typeof input !== 'string' || input.length === 0) {
      throw new TenancyError({
        code: ErrorCode.TenantSlugInvalid,
        message: 'Tenant slug is required'
      });
    }

    if (input.length < TENANT_SLUG_MIN_LENGTH || input.length > TENANT_SLUG_MAX_LENGTH) {
      throw new TenancyError({
        code: ErrorCode.TenantSlugInvalid,
        message: `Tenant slug must be ${TENANT_SLUG_MIN_LENGTH}-${TENANT_SLUG_MAX_LENGTH} characters`
      });
    }

    if (!TENANT_SLUG_REGEX.test(input)) {
      throw new TenancyError({
        code: ErrorCode.TenantSlugInvalid,
        message:
          'Tenant slug must be lower-case letters, numbers, and hyphens only, with no leading or trailing hyphen'
      });
    }

    return new TenantSlug(input);
  }

  toString(): string {
    return this.value;
  }
}
