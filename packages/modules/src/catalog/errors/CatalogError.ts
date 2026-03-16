import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type CatalogErrorCode =
  | ErrorCode.CatalogProductNotFound
  | ErrorCode.CatalogCategoryNotFound
  | ErrorCode.CatalogSlugInvalid
  | ErrorCode.CatalogSlugTaken
  | ErrorCode.CatalogPriceInvalid
  | ErrorCode.CatalogCurrencyNotSupported
  | ErrorCode.CatalogInventoryRuleViolation
  | ErrorCode.CatalogValidationFailed;

type CatalogErrorParams = {
  code: CatalogErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class CatalogError extends AppError {
  declare readonly code: CatalogErrorCode;

  constructor(params: CatalogErrorParams) {
    super(params);
    this.name = 'CatalogError';
  }

  static is(error: unknown): error is CatalogError {
    return error instanceof CatalogError;
  }
}
