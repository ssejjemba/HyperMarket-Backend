import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../errors/TenancyError';
import type { TenantSlug } from './TenantSlug';

const DOMAIN_LABEL_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const assertPlatformRootDomain = (platformRootDomain: string): string => {
  if (typeof platformRootDomain !== 'string' || platformRootDomain.length === 0) {
    throw new TenancyError({
      code: ErrorCode.TenantDomainInvalid,
      message: 'Platform root domain is required'
    });
  }

  const labels = platformRootDomain.split('.');
  if (
    labels.length < 2 ||
    labels.some((label) => label.length === 0 || !DOMAIN_LABEL_REGEX.test(label))
  ) {
    throw new TenancyError({
      code: ErrorCode.TenantDomainInvalid,
      message: 'Platform root domain is invalid'
    });
  }

  return platformRootDomain;
};

export class DomainName {
  private constructor(private readonly value: string) {}

  static parseSubdomain(
    input: string,
    tenantSlug: TenantSlug,
    platformRootDomain: string
  ): DomainName {
    if (typeof input !== 'string' || input.length === 0) {
      throw new TenancyError({
        code: ErrorCode.TenantDomainInvalid,
        message: 'Tenant domain is required'
      });
    }

    const rootDomain = assertPlatformRootDomain(platformRootDomain);
    const expected = `${tenantSlug.toString()}.${rootDomain}`;

    if (input !== expected) {
      throw new TenancyError({
        code: ErrorCode.TenantDomainInvalid,
        message: `Tenant domain must match ${expected}`
      });
    }

    return new DomainName(input);
  }

  toString(): string {
    return this.value;
  }
}
