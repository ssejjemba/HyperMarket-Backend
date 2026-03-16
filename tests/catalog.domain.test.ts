import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { CatalogError, CatalogSlug, InventoryPolicy, UgxMoney } from '@hypermarket/modules/catalog';

describe('CAT domain values', () => {
  it('accepts valid slugs', () => {
    expect(CatalogSlug.parse('fresh-milk').toString()).toBe('fresh-milk');
  });

  it('rejects invalid slugs loudly', () => {
    expect(() => CatalogSlug.parse('Fresh Milk')).toThrowError(CatalogError);
    expect(() => CatalogSlug.parse('Fresh Milk')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.CatalogSlugInvalid
      })
    );
  });

  it('enforces UGX-only price rules', () => {
    const money = UgxMoney.create(1500, 'UGX');
    expect(money.amount).toBe(1500);
    expect(money.assertCompareAt(2000)).toBe(2000);
    expect(() => UgxMoney.create(1500, 'USD')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.CatalogCurrencyNotSupported
      })
    );
    expect(() => money.assertCompareAt(1500)).toThrowError(
      expect.objectContaining({
        code: ErrorCode.CatalogPriceInvalid
      })
    );
  });

  it('normalizes inventory consistently', () => {
    expect(
      InventoryPolicy.normalize({
        trackInventory: false,
        stockQuantity: 10
      })
    ).toEqual({
      trackInventory: false,
      stockQuantity: null
    });

    expect(() =>
      InventoryPolicy.normalize({
        trackInventory: true,
        stockQuantity: null
      })
    ).toThrowError(
      expect.objectContaining({
        code: ErrorCode.CatalogInventoryRuleViolation
      })
    );
  });
});
