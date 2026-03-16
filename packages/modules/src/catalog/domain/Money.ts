import { ErrorCode } from '@hypermarket/contracts';

import { CatalogError } from '../errors/CatalogError';

export class UgxMoney {
  readonly amount: number;
  readonly currency: 'UGX';

  private constructor(amount: number) {
    this.amount = amount;
    this.currency = 'UGX';
  }

  static create(amount: number, currency: string): UgxMoney {
    if (currency !== 'UGX') {
      throw new CatalogError({
        code: ErrorCode.CatalogCurrencyNotSupported,
        message: 'Only UGX is supported for catalog pricing in MVP'
      });
    }

    if (!Number.isInteger(amount) || amount < 0) {
      throw new CatalogError({
        code: ErrorCode.CatalogPriceInvalid,
        message: 'price_amount must be an integer greater than or equal to 0'
      });
    }

    return new UgxMoney(amount);
  }

  assertCompareAt(compareAtAmount: number | null | undefined): number | null {
    if (compareAtAmount === null || compareAtAmount === undefined) {
      return null;
    }

    if (!Number.isInteger(compareAtAmount) || compareAtAmount <= this.amount) {
      throw new CatalogError({
        code: ErrorCode.CatalogPriceInvalid,
        message: 'compare_at_price_amount must be greater than price_amount when present'
      });
    }

    return compareAtAmount;
  }
}
