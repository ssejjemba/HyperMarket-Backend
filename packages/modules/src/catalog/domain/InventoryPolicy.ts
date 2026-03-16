import { ErrorCode } from '@hypermarket/contracts';

import { CatalogError } from '../errors/CatalogError';

export type InventoryState = {
  trackInventory: boolean;
  stockQuantity: number | null;
};

export class InventoryPolicy {
  static normalize(input: InventoryState): InventoryState {
    if (!input.trackInventory) {
      return {
        trackInventory: false,
        stockQuantity: null
      };
    }

    if (
      input.stockQuantity === null ||
      !Number.isInteger(input.stockQuantity) ||
      input.stockQuantity < 0
    ) {
      throw new CatalogError({
        code: ErrorCode.CatalogInventoryRuleViolation,
        message: 'stock_quantity must be an integer greater than or equal to 0 when tracked'
      });
    }

    return input;
  }
}
