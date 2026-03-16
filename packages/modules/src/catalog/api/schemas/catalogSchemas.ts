import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { CatalogError } from '../../errors/CatalogError';

const uuidParam = z.string().uuid('must be a valid UUID');

export const tenantIdParamsSchema = z.object({
  tenantId: uuidParam
});

export const catalogCategoryParamsSchema = z.object({
  tenantId: uuidParam,
  categoryId: uuidParam
});

export const catalogProductParamsSchema = z.object({
  tenantId: uuidParam,
  productId: uuidParam
});

const variantSchema = z
  .object({
    name: z.string().min(1, 'variant name is required').max(120),
    sku: z.string().trim().max(120).nullable().optional(),
    price_amount: z.number().int().min(0).nullable().optional(),
    stock_quantity: z.number().int().min(0).nullable().optional(),
    options: z.record(z.unknown())
  })
  .strict();

export const createCategoryBodySchema = z
  .object({
    name: z.string().min(1, 'name is required').max(255),
    slug: z.string().min(1, 'slug is required').max(80),
    description: z.string().max(5000).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_visible: z.boolean().optional()
  })
  .strict();

export const updateCategoryBodySchema = createCategoryBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required'
  });

export const createProductBodySchema = z
  .object({
    name: z.string().min(1, 'name is required').max(255),
    slug: z.string().min(1, 'slug is required').max(80),
    description: z.string().max(10000).nullable().optional(),
    status: z.enum(['active', 'draft', 'archived']),
    primary_image_asset_id: z.string().uuid().nullable().optional(),
    price_amount: z.number().int(),
    compare_at_price_amount: z.number().int().nullable().optional(),
    currency: z.string().min(1),
    track_inventory: z.boolean(),
    stock_quantity: z.number().int().nullable(),
    sku: z.string().trim().max(120).nullable().optional(),
    attributes: z.record(z.unknown()).optional(),
    variants: z.array(variantSchema).optional()
  })
  .strict();

export const updateProductBodySchema = createProductBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required'
  });

export const replaceProductCategoriesBodySchema = z
  .object({
    category_ids: z.array(z.string().uuid()).max(100)
  })
  .strict();

export const storefrontTenantParamsSchema = z.object({
  tenantSlug: z.string().min(1)
});

export const storefrontCategoryParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  categorySlug: z.string().min(1)
});

export const storefrontProductParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  productSlug: z.string().min(1)
});

export const listCatalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
  include_deleted: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
  is_visible: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
  status: z.enum(['active', 'draft', 'archived']).optional()
});

export const publicListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional()
});

export const parseCatalogValidation = <T>(result: z.SafeParseReturnType<unknown, T>): T => {
  if (!result.success) {
    throw new CatalogError({
      code: ErrorCode.CatalogValidationFailed,
      message: result.error.issues[0]?.message ?? 'Catalog request is invalid',
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  return result.data;
};
