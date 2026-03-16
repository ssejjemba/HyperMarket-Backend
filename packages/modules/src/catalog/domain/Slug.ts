import { ErrorCode } from '@hypermarket/contracts';

import { CatalogError } from '../errors/CatalogError';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CatalogSlug {
  private constructor(private readonly value: string) {}

  static parse(input: string): CatalogSlug {
    const value = input.trim();
    if (value.length < 2 || value.length > 80 || !SLUG_PATTERN.test(value)) {
      throw new CatalogError({
        code: ErrorCode.CatalogSlugInvalid,
        message: 'slug must be 2-80 chars, lowercase, use only a-z, 0-9, and single interior dashes'
      });
    }

    return new CatalogSlug(value);
  }

  toString(): string {
    return this.value;
  }
}
