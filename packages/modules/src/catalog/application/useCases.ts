import {
  createAuditWriter,
  createOutboxWriter,
  runInTransaction,
  type DatabaseSchema
} from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';

import { CatalogError } from '../errors/CatalogError';
import { CatalogSlug, InventoryPolicy, UgxMoney } from '../domain';
import {
  createCatalogRepoPg,
  type CatalogCategoryRecord,
  type CatalogProductRecord,
  type CatalogStatus
} from '../persistence/CatalogRepoPg';
import type { CatalogRevalidationPlanner } from './RevalidationPlanner';
import { toAuditRequestId } from './auditRequestId';

type VariantInput = {
  name: string;
  sku?: string | null | undefined;
  price_amount?: number | null | undefined;
  stock_quantity?: number | null | undefined;
  options: Record<string, unknown>;
};

type PageInput = {
  page?: number;
  pageSize?: number;
};

const normalizePage = (input: PageInput): { page: number; pageSize: number } => ({
  page: input.page ?? 1,
  pageSize: input.pageSize ?? 20
});

const withOptional = <T extends object, K extends string, V>(
  value: T,
  key: K,
  next: V | undefined
): T & Partial<Record<K, V>> => {
  if (next === undefined) {
    return value as T & Partial<Record<K, V>>;
  }

  return {
    ...value,
    [key]: next
  } as T & Partial<Record<K, V>>;
};

const mapCategoryAudit = (category: CatalogCategoryRecord): Record<string, unknown> => ({
  id: category.id,
  tenant_id: category.tenantId,
  name: category.name,
  slug: category.slug,
  description: category.description,
  sort_order: category.sortOrder,
  is_visible: category.isVisible,
  deleted_at: category.deletedAt?.toISOString() ?? null
});

const mapProductAudit = (product: CatalogProductRecord): Record<string, unknown> => ({
  id: product.id,
  tenant_id: product.tenantId,
  name: product.name,
  slug: product.slug,
  status: product.status,
  primary_image_asset_id: product.primaryImageAssetId,
  price_amount: product.priceAmount,
  compare_at_price_amount: product.compareAtPriceAmount,
  currency: product.currency,
  track_inventory: product.trackInventory,
  stock_quantity: product.stockQuantity,
  sku: product.sku,
  attributes: product.attributes,
  category_ids: product.categoryIds,
  deleted_at: product.deletedAt?.toISOString() ?? null
});

const validateName = (name: string, type: 'category' | 'product'): string => {
  const value = name.trim();
  if (value.length === 0) {
    throw new CatalogError({
      code: ErrorCode.CatalogValidationFailed,
      message: `${type} name is required`
    });
  }

  return value;
};

const validateVariants = (variants: VariantInput[] | undefined): VariantInput[] | undefined => {
  if (variants === undefined) {
    return undefined;
  }

  for (const variant of variants) {
    if (variant.name.trim().length === 0) {
      throw new CatalogError({
        code: ErrorCode.CatalogValidationFailed,
        message: 'variant name is required'
      });
    }
  }

  return variants.map((variant) => ({
    name: variant.name.trim(),
    options: variant.options,
    ...(variant.sku !== undefined ? { sku: variant.sku?.trim() ?? null } : {}),
    ...(variant.price_amount !== undefined ? { price_amount: variant.price_amount } : {}),
    ...(variant.stock_quantity !== undefined ? { stock_quantity: variant.stock_quantity } : {})
  }));
};

const toCatalogTargets = (
  planner: CatalogRevalidationPlanner,
  input:
    | { tenantId: string; categorySlug: string; kind: 'category' }
    | { tenantId: string; productSlug: string; kind: 'product' }
    | { tenantId: string; kind: 'tenant' }
) => {
  if (input.kind === 'category') {
    return planner.planForCategory({
      tenantId: input.tenantId,
      categorySlug: input.categorySlug
    }).targets;
  }

  if (input.kind === 'product') {
    return planner.planForProduct({
      tenantId: input.tenantId,
      productSlug: input.productSlug
    }).targets;
  }

  return planner.planForTenant(input.tenantId).targets;
};

const mapProductInput = (input: {
  name: string;
  slug: string;
  description?: string | null;
  status: CatalogStatus;
  primaryImageAssetId?: string | null;
  priceAmount: number;
  compareAtPriceAmount?: number | null;
  currency: string;
  trackInventory: boolean;
  stockQuantity: number | null;
  sku?: string | null;
  attributes?: Record<string, unknown>;
  variants?: VariantInput[];
}) => {
  const money = UgxMoney.create(input.priceAmount, input.currency);
  const inventory = InventoryPolicy.normalize({
    trackInventory: input.trackInventory,
    stockQuantity: input.stockQuantity
  });

  return {
    name: validateName(input.name, 'product'),
    slug: CatalogSlug.parse(input.slug).toString(),
    description: input.description?.trim() ?? null,
    status: input.status,
    primaryImageAssetId: input.primaryImageAssetId ?? null,
    priceAmount: money.amount,
    compareAtPriceAmount: money.assertCompareAt(input.compareAtPriceAmount),
    currency: money.currency,
    trackInventory: inventory.trackInventory,
    stockQuantity: inventory.stockQuantity,
    sku: input.sku?.trim() ?? null,
    attributes: input.attributes ?? {},
    ...(input.variants !== undefined
      ? {
          variants: validateVariants(input.variants)?.map((variant) => ({
            name: variant.name,
            options: variant.options,
            ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
            ...(variant.price_amount !== undefined ? { priceAmount: variant.price_amount } : {}),
            ...(variant.stock_quantity !== undefined
              ? { stockQuantity: variant.stock_quantity }
              : {})
          }))
        }
      : {})
  };
};

const translateConstraintError = (error: unknown): never => {
  if (error instanceof Error) {
    if (
      error.message.includes('products_tenant_slug_unique') ||
      error.message.includes('categories_tenant_slug_unique')
    ) {
      throw new CatalogError({
        code: ErrorCode.CatalogSlugTaken,
        message: 'slug is already in use for this tenant',
        cause: error
      });
    }
  }

  throw error;
};

export const createCatalogUseCases = (deps: {
  db: Kysely<DatabaseSchema>;
  revalidationPlanner: CatalogRevalidationPlanner;
}) => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();

  return {
    async createCategory(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string;
      name: string;
      slug: string;
      description?: string | null;
      sortOrder?: number;
      isVisible?: boolean;
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createCatalogRepoPg(trx);
          const category = await repo.createCategory({
            tenantId: input.tenantId,
            name: validateName(input.name, 'category'),
            slug: CatalogSlug.parse(input.slug).toString(),
            ...(input.description !== undefined
              ? { description: input.description?.trim() ?? null }
              : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {})
          });

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'catalog.category.upserted',
            targetType: 'category',
            targetId: category.id,
            after: mapCategoryAudit(category),
            requestId: toAuditRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Catalog.CategoryUpserted',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              category_id: category.id,
              slug: category.slug,
              targets: toCatalogTargets(deps.revalidationPlanner, {
                tenantId: input.tenantId,
                categorySlug: category.slug,
                kind: 'category'
              })
            }
          });

          return category;
        });
      } catch (error) {
        return translateConstraintError(error);
      }
    },

    async updateCategory(input: {
      tenantId: string;
      categoryId: string;
      actorUserId: string;
      requestId?: string;
      name?: string;
      slug?: string;
      description?: string | null;
      sortOrder?: number;
      isVisible?: boolean;
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createCatalogRepoPg(trx);
          const previous = await repo.getCategoryById(input.tenantId, input.categoryId);
          if (previous === null || previous.deletedAt !== null) {
            throw new CatalogError({
              code: ErrorCode.CatalogCategoryNotFound,
              message: 'Category not found'
            });
          }

          let categoryUpdate = {
            tenantId: input.tenantId,
            categoryId: input.categoryId
          };
          categoryUpdate = withOptional(
            categoryUpdate,
            'name',
            input.name === undefined ? undefined : validateName(input.name, 'category')
          );
          categoryUpdate = withOptional(
            categoryUpdate,
            'slug',
            input.slug === undefined ? undefined : CatalogSlug.parse(input.slug).toString()
          );
          categoryUpdate = withOptional(
            categoryUpdate,
            'description',
            input.description === undefined ? undefined : (input.description?.trim() ?? null)
          );
          categoryUpdate = withOptional(categoryUpdate, 'sortOrder', input.sortOrder);
          categoryUpdate = withOptional(categoryUpdate, 'isVisible', input.isVisible);

          const category = await repo.updateCategory(categoryUpdate);

          if (category === null) {
            throw new CatalogError({
              code: ErrorCode.CatalogCategoryNotFound,
              message: 'Category not found'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'catalog.category.upserted',
            targetType: 'category',
            targetId: category.id,
            before: mapCategoryAudit(previous),
            after: mapCategoryAudit(category),
            requestId: toAuditRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Catalog.CategoryUpserted',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              category_id: category.id,
              slug: category.slug,
              targets: toCatalogTargets(deps.revalidationPlanner, {
                tenantId: input.tenantId,
                categorySlug: category.slug,
                kind: 'category'
              })
            }
          });

          return category;
        });
      } catch (error) {
        return translateConstraintError(error);
      }
    },

    async deleteCategory(input: {
      tenantId: string;
      categoryId: string;
      actorUserId: string;
      requestId?: string;
    }) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createCatalogRepoPg(trx);
        const previous = await repo.getCategoryById(input.tenantId, input.categoryId);
        if (previous === null || previous.deletedAt !== null) {
          throw new CatalogError({
            code: ErrorCode.CatalogCategoryNotFound,
            message: 'Category not found'
          });
        }

        const category = await repo.softDeleteCategory(input.tenantId, input.categoryId);
        if (category === null) {
          throw new CatalogError({
            code: ErrorCode.CatalogCategoryNotFound,
            message: 'Category not found'
          });
        }

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'catalog.category.deleted',
          targetType: 'category',
          targetId: category.id,
          before: mapCategoryAudit(previous),
          after: mapCategoryAudit(category),
          requestId: toAuditRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Catalog.CategoryDeleted',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          correlationId: toAuditRequestId(input.requestId),
          payload: {
            tenant_id: input.tenantId,
            category_id: category.id,
            slug: category.slug,
            targets: toCatalogTargets(deps.revalidationPlanner, {
              tenantId: input.tenantId,
              categorySlug: category.slug,
              kind: 'category'
            })
          }
        });

        return category;
      });
    },

    async listCategories(input: {
      tenantId: string;
      page?: number;
      pageSize?: number;
      includeDeleted?: boolean;
      isVisible?: boolean;
    }) {
      let filters = normalizePage(input);
      filters = withOptional(filters, 'includeDeleted', input.includeDeleted);
      filters = withOptional(filters, 'isVisible', input.isVisible);
      return createCatalogRepoPg(deps.db).listCategories(input.tenantId, filters);
    },

    async createProduct(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string;
      name: string;
      slug: string;
      description?: string | null;
      status: CatalogStatus;
      primaryImageAssetId?: string | null;
      priceAmount: number;
      compareAtPriceAmount?: number | null;
      currency: string;
      trackInventory: boolean;
      stockQuantity: number | null;
      sku?: string | null;
      attributes?: Record<string, unknown>;
      variants?: VariantInput[];
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createCatalogRepoPg(trx);
          const mapped = mapProductInput(input);
          const product = await repo.createProduct({
            tenantId: input.tenantId,
            ...mapped
          });

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'catalog.product.upserted',
            targetType: 'product',
            targetId: product.id,
            after: mapProductAudit(product),
            requestId: toAuditRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Catalog.ProductUpserted',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              product_id: product.id,
              slug: product.slug,
              targets: toCatalogTargets(deps.revalidationPlanner, {
                tenantId: input.tenantId,
                productSlug: product.slug,
                kind: 'product'
              })
            }
          });

          return product;
        });
      } catch (error) {
        return translateConstraintError(error);
      }
    },

    async updateProduct(input: {
      tenantId: string;
      productId: string;
      actorUserId: string;
      requestId?: string;
      name?: string;
      slug?: string;
      description?: string | null;
      status?: CatalogStatus;
      primaryImageAssetId?: string | null;
      priceAmount?: number;
      compareAtPriceAmount?: number | null;
      currency?: string;
      trackInventory?: boolean;
      stockQuantity?: number | null;
      sku?: string | null;
      attributes?: Record<string, unknown>;
      variants?: VariantInput[];
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createCatalogRepoPg(trx);
          const previous = await repo.getProductById(input.tenantId, input.productId);
          if (previous === null || previous.deletedAt !== null) {
            throw new CatalogError({
              code: ErrorCode.CatalogProductNotFound,
              message: 'Product not found'
            });
          }

          const product = await repo.updateProduct({
            tenantId: input.tenantId,
            productId: input.productId,
            ...mapProductInput({
              name: input.name ?? previous.name,
              slug: input.slug ?? previous.slug,
              description: input.description ?? previous.description,
              status: input.status ?? previous.status,
              primaryImageAssetId:
                input.primaryImageAssetId === undefined
                  ? previous.primaryImageAssetId
                  : input.primaryImageAssetId,
              priceAmount: input.priceAmount ?? previous.priceAmount,
              compareAtPriceAmount:
                input.compareAtPriceAmount === undefined
                  ? previous.compareAtPriceAmount
                  : input.compareAtPriceAmount,
              currency: input.currency ?? previous.currency,
              trackInventory: input.trackInventory ?? previous.trackInventory,
              stockQuantity:
                input.stockQuantity === undefined ? previous.stockQuantity : input.stockQuantity,
              sku: input.sku === undefined ? previous.sku : input.sku,
              attributes: input.attributes ?? previous.attributes,
              variants:
                input.variants === undefined
                  ? previous.variants.map((variant) => ({
                      name: variant.name,
                      sku: variant.sku,
                      price_amount: variant.priceAmount,
                      stock_quantity: variant.stockQuantity,
                      options: variant.options
                    }))
                  : input.variants
            })
          });

          if (product === null) {
            throw new CatalogError({
              code: ErrorCode.CatalogProductNotFound,
              message: 'Product not found'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'catalog.product.upserted',
            targetType: 'product',
            targetId: product.id,
            before: mapProductAudit(previous),
            after: mapProductAudit(product),
            requestId: toAuditRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Catalog.ProductUpserted',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              product_id: product.id,
              slug: product.slug,
              targets: toCatalogTargets(deps.revalidationPlanner, {
                tenantId: input.tenantId,
                productSlug: product.slug,
                kind: 'product'
              })
            }
          });

          return product;
        });
      } catch (error) {
        return translateConstraintError(error);
      }
    },

    async deleteProduct(input: {
      tenantId: string;
      productId: string;
      actorUserId: string;
      requestId?: string;
    }) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createCatalogRepoPg(trx);
        const previous = await repo.getProductById(input.tenantId, input.productId);
        if (previous === null || previous.deletedAt !== null) {
          throw new CatalogError({
            code: ErrorCode.CatalogProductNotFound,
            message: 'Product not found'
          });
        }

        const product = await repo.softDeleteProduct(input.tenantId, input.productId);
        if (product === null) {
          throw new CatalogError({
            code: ErrorCode.CatalogProductNotFound,
            message: 'Product not found'
          });
        }

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'catalog.product.deleted',
          targetType: 'product',
          targetId: product.id,
          before: mapProductAudit(previous),
          after: mapProductAudit(product),
          requestId: toAuditRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Catalog.ProductDeleted',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          correlationId: toAuditRequestId(input.requestId),
          payload: {
            tenant_id: input.tenantId,
            product_id: product.id,
            slug: product.slug,
            targets: toCatalogTargets(deps.revalidationPlanner, {
              tenantId: input.tenantId,
              productSlug: product.slug,
              kind: 'product'
            })
          }
        });

        return product;
      });
    },

    async listProducts(input: {
      tenantId: string;
      page?: number;
      pageSize?: number;
      includeDeleted?: boolean;
      status?: CatalogStatus;
    }) {
      let filters = normalizePage(input);
      filters = withOptional(filters, 'includeDeleted', input.includeDeleted);
      filters = withOptional(filters, 'status', input.status);
      return createCatalogRepoPg(deps.db).listProducts(input.tenantId, filters);
    },

    async assignCategories(input: {
      tenantId: string;
      productId: string;
      actorUserId: string;
      requestId?: string;
      categoryIds: string[];
    }) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createCatalogRepoPg(trx);
        const product = await repo.getProductById(input.tenantId, input.productId);
        if (product === null || product.deletedAt !== null) {
          throw new CatalogError({
            code: ErrorCode.CatalogProductNotFound,
            message: 'Product not found'
          });
        }

        const categoryCount = await repo.countExistingCategories(input.tenantId, input.categoryIds);
        if (categoryCount !== input.categoryIds.length) {
          throw new CatalogError({
            code: ErrorCode.CatalogCategoryNotFound,
            message: 'One or more categories were not found'
          });
        }

        await repo.replaceProductCategories(input.tenantId, input.productId, input.categoryIds);
        const updated = (await repo.getProductById(
          input.tenantId,
          input.productId
        )) as CatalogProductRecord;

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'catalog.product.categories.replaced',
          targetType: 'product',
          targetId: updated.id,
          before: { category_ids: product.categoryIds },
          after: { category_ids: updated.categoryIds },
          requestId: toAuditRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Catalog.ProductCategoryChanged',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          correlationId: toAuditRequestId(input.requestId),
          payload: {
            tenant_id: input.tenantId,
            product_id: updated.id,
            category_ids: updated.categoryIds,
            targets: toCatalogTargets(deps.revalidationPlanner, {
              tenantId: input.tenantId,
              kind: 'tenant'
            })
          }
        });

        return updated;
      });
    },

    async listStorefrontCategories(input: { tenantId: string; page?: number; pageSize?: number }) {
      return createCatalogRepoPg(deps.db).listVisibleCategories(
        input.tenantId,
        normalizePage(input)
      );
    },

    async getStorefrontCategory(input: {
      tenantId: string;
      categorySlug: string;
      page?: number;
      pageSize?: number;
    }) {
      const repo = createCatalogRepoPg(deps.db);
      const category = await repo.getVisibleCategoryBySlug(
        input.tenantId,
        CatalogSlug.parse(input.categorySlug).toString()
      );
      if (category === null) {
        throw new CatalogError({
          code: ErrorCode.CatalogCategoryNotFound,
          message: 'Category not found'
        });
      }

      const products = await repo.listPublicProducts(input.tenantId, {
        ...normalizePage(input),
        categorySlug: category.slug
      });

      return { category, products };
    },

    async listStorefrontProducts(input: { tenantId: string; page?: number; pageSize?: number }) {
      return createCatalogRepoPg(deps.db).listPublicProducts(input.tenantId, normalizePage(input));
    },

    async getStorefrontProduct(input: { tenantId: string; productSlug: string }) {
      const product = await createCatalogRepoPg(deps.db).getPublicProductBySlug(
        input.tenantId,
        CatalogSlug.parse(input.productSlug).toString()
      );

      if (product === null) {
        throw new CatalogError({
          code: ErrorCode.CatalogProductNotFound,
          message: 'Product not found'
        });
      }

      return product;
    }
  };
};
