import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { DomainName, TenantSlug, TenancyError } from '@hypermarket/modules/tenancy';

const expectTenancyError = (fn: () => unknown, code: ErrorCode): void => {
  let thrown: unknown;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(TenancyError);
  expect((thrown as TenancyError).code).toBe(code);
};

describe('TenantSlug', () => {
  it.each(['shop-1', 'kampala-market', 'abc', 'store123'])('accepts valid slug %s', (input) => {
    expect(TenantSlug.parse(input).toString()).toBe(input);
  });

  it.each([
    '',
    'ab',
    'A-shop',
    'shop_1',
    '-shop',
    'shop-',
    'two--dashes',
    'shop.example',
    'x'.repeat(64)
  ])('rejects invalid slug %s', (input) => {
    expectTenancyError(() => TenantSlug.parse(input), ErrorCode.TenantSlugInvalid);
  });
});

describe('DomainName', () => {
  const rootDomain = 'platform.ug';

  it('accepts exact tenant subdomain under the configured root', () => {
    const slug = TenantSlug.parse('kampala-market');
    const domain = DomainName.parseSubdomain('kampala-market.platform.ug', slug, rootDomain);

    expect(domain.toString()).toBe('kampala-market.platform.ug');
  });

  it.each([
    'kampala-market.example.com',
    'kampala-market.platform.com',
    'other.platform.ug',
    'Kampala-market.platform.ug',
    'kampala-market.platform.ug.'
  ])('rejects domain outside the configured root or wrong subdomain: %s', (input) => {
    const slug = TenantSlug.parse('kampala-market');
    expectTenancyError(
      () => DomainName.parseSubdomain(input, slug, rootDomain),
      ErrorCode.TenantDomainInvalid
    );
  });

  it('rejects invalid platform root domains', () => {
    const slug = TenantSlug.parse('kampala-market');
    expectTenancyError(
      () => DomainName.parseSubdomain('kampala-market.platform.ug', slug, 'Platform.ug'),
      ErrorCode.TenantDomainInvalid
    );
  });
});
