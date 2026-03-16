import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type CatalogStatus = 'active' | 'draft' | 'archived';

export type CatalogVariantRecord = {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string | null;
  priceAmount: number | null;
  stockQuantity: number | null;
  options: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CatalogCategoryRecord = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CatalogProductRecord = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  status: CatalogStatus;
  primaryImageAssetId: string | null;
  priceAmount: number;
  compareAtPriceAmount: number | null;
  currency: string;
  trackInventory: boolean;
  stockQuantity: number | null;
  sku: string | null;
  attributes: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  variants: CatalogVariantRecord[];
  categoryIds: string[];
};

type Pagination = {
  page: number;
  pageSize: number;
};

type CategoryListFilters = Pagination & {
  includeDeleted?: boolean;
  isVisible?: boolean;
};

type ProductListFilters = Pagination & {
  includeDeleted?: boolean;
  status?: CatalogStatus;
};

type CreateCategoryInput = {
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
};

type UpdateCategoryInput = Partial<Omit<CreateCategoryInput, 'tenantId'>> & {
  tenantId: string;
  categoryId: string;
};

type CreateVariantInput = {
  name: string;
  sku?: string | null | undefined;
  priceAmount?: number | null | undefined;
  stockQuantity?: number | null | undefined;
  options: Record<string, unknown>;
};

type CreateProductInput = {
  tenantId: string;
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
  variants?: CreateVariantInput[] | undefined;
};

type UpdateProductInput = Partial<Omit<CreateProductInput, 'tenantId'>> & {
  tenantId: string;
  productId: string;
};

type PublicProductListFilters = Pagination & {
  categorySlug?: string;
};

type PublicCategoryResult = {
  items: CatalogCategoryRecord[];
  total: number;
};

type PublicProductResult = {
  items: CatalogProductRecord[];
  total: number;
};

const mapCategory = (row: DatabaseSchema['categories']): CatalogCategoryRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  sortOrder: row.sort_order,
  isVisible: row.is_visible,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at
});

const mapVariant = (row: DatabaseSchema['product_variants']): CatalogVariantRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  productId: row.product_id,
  name: row.name,
  sku: row.sku,
  priceAmount: row.price_amount,
  stockQuantity: row.stock_quantity,
  options: row.options,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapProductBase = (
  row: DatabaseSchema['products']
): Omit<CatalogProductRecord, 'variants' | 'categoryIds'> => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  status: row.status,
  primaryImageAssetId: row.primary_image_asset_id,
  priceAmount: row.price_amount,
  compareAtPriceAmount: row.compare_at_price_amount,
  currency: row.currency,
  trackInventory: row.track_inventory,
  stockQuantity: row.stock_quantity,
  sku: row.sku,
  attributes: row.attributes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at
});

const loadVariantsByProductIds = async (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  productIds: string[]
): Promise<Map<string, CatalogVariantRecord[]>> => {
  if (productIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom('product_variants')
    .selectAll()
    .where('product_id', 'in', productIds)
    .orderBy('created_at', 'asc')
    .execute();

  const grouped = new Map<string, CatalogVariantRecord[]>();
  for (const row of rows) {
    const existing = grouped.get(row.product_id) ?? [];
    existing.push(mapVariant(row));
    grouped.set(row.product_id, existing);
  }

  return grouped;
};

const loadCategoryIdsByProductIds = async (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  productIds: string[]
): Promise<Map<string, string[]>> => {
  if (productIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom('product_categories')
    .select(['product_id', 'category_id'])
    .where('product_id', 'in', productIds)
    .execute();

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const existing = grouped.get(row.product_id) ?? [];
    existing.push(row.category_id);
    grouped.set(row.product_id, existing);
  }

  return grouped;
};

const hydrateProducts = async (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  rows: DatabaseSchema['products'][]
): Promise<CatalogProductRecord[]> => {
  const productIds = rows.map((row) => row.id);
  const [variants, categories] = await Promise.all([
    loadVariantsByProductIds(db, productIds),
    loadCategoryIdsByProductIds(db, productIds)
  ]);

  return rows.map((row) => ({
    ...mapProductBase(row),
    variants: variants.get(row.id) ?? [],
    categoryIds: categories.get(row.id) ?? []
  }));
};

const extractCount = (row: unknown): number => {
  const value = (row as { count?: number | string }).count;
  return Number(value ?? 0);
};

const applyPagination = <T extends { offset: (value: number) => T; limit: (value: number) => T }>(
  query: T,
  pagination: Pagination
): T => query.offset((pagination.page - 1) * pagination.pageSize).limit(pagination.pageSize);

export const createCatalogRepoPg = (db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>) => {
  return {
    async createCategory(input: CreateCategoryInput): Promise<CatalogCategoryRecord> {
      const row = await db
        .insertInto('categories')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          sort_order: input.sortOrder ?? 0,
          is_visible: input.isVisible ?? true,
          created_at: sql`now()`,
          updated_at: sql`now()`,
          deleted_at: null
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapCategory(row);
    },

    async updateCategory(input: UpdateCategoryInput): Promise<CatalogCategoryRecord | null> {
      const changes: Partial<DatabaseSchema['categories']> = {
        updated_at: new Date()
      };

      if (input.name !== undefined) changes.name = input.name;
      if (input.slug !== undefined) changes.slug = input.slug;
      if (input.description !== undefined) changes.description = input.description;
      if (input.sortOrder !== undefined) changes.sort_order = input.sortOrder;
      if (input.isVisible !== undefined) changes.is_visible = input.isVisible;

      const row = await db
        .updateTable('categories')
        .set(changes)
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.categoryId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : mapCategory(row);
    },

    async softDeleteCategory(
      tenantId: string,
      categoryId: string
    ): Promise<CatalogCategoryRecord | null> {
      const row = await db
        .updateTable('categories')
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
          is_visible: false
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : mapCategory(row);
    },

    async getCategoryById(
      tenantId: string,
      categoryId: string
    ): Promise<CatalogCategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', categoryId)
        .executeTakeFirst();

      return row === undefined ? null : mapCategory(row);
    },

    async getCategoryBySlug(tenantId: string, slug: string): Promise<CatalogCategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('slug', '=', slug)
        .executeTakeFirst();

      return row === undefined ? null : mapCategory(row);
    },

    async listCategories(
      tenantId: string,
      filters: CategoryListFilters
    ): Promise<{ items: CatalogCategoryRecord[]; total: number }> {
      const base = db
        .selectFrom('categories')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .$if(filters.includeDeleted !== true, (query) => query.where('deleted_at', 'is', null))
        .$if(filters.isVisible !== undefined, (query) =>
          query.where('is_visible', '=', filters.isVisible as boolean)
        );

      const totalRow = await base
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .clearSelect()
        .executeTakeFirstOrThrow();
      const rows = await applyPagination(
        base.orderBy('sort_order', 'asc').orderBy('created_at', 'asc'),
        filters
      ).execute();

      return {
        items: rows.map(mapCategory),
        total: extractCount(totalRow)
      };
    },

    async createProduct(input: CreateProductInput): Promise<CatalogProductRecord> {
      const row = await db
        .insertInto('products')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          status: input.status,
          primary_image_asset_id: input.primaryImageAssetId ?? null,
          price_amount: input.priceAmount,
          compare_at_price_amount: input.compareAtPriceAmount ?? null,
          currency: input.currency,
          track_inventory: input.trackInventory,
          stock_quantity: input.stockQuantity,
          sku: input.sku ?? null,
          attributes: input.attributes ?? {},
          created_at: sql`now()`,
          updated_at: sql`now()`,
          deleted_at: null
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (input.variants !== undefined) {
        await this.replaceVariants(input.tenantId, row.id, input.variants);
      }

      return (await this.getProductById(input.tenantId, row.id)) as CatalogProductRecord;
    },

    async updateProduct(input: UpdateProductInput): Promise<CatalogProductRecord | null> {
      const changes: Partial<DatabaseSchema['products']> = {
        updated_at: new Date()
      };

      if (input.name !== undefined) changes.name = input.name;
      if (input.slug !== undefined) changes.slug = input.slug;
      if (input.description !== undefined) changes.description = input.description;
      if (input.status !== undefined) changes.status = input.status;
      if (input.primaryImageAssetId !== undefined)
        changes.primary_image_asset_id = input.primaryImageAssetId;
      if (input.priceAmount !== undefined) changes.price_amount = input.priceAmount;
      if (input.compareAtPriceAmount !== undefined) {
        changes.compare_at_price_amount = input.compareAtPriceAmount;
      }
      if (input.currency !== undefined) changes.currency = input.currency;
      if (input.trackInventory !== undefined) changes.track_inventory = input.trackInventory;
      if (input.stockQuantity !== undefined) changes.stock_quantity = input.stockQuantity;
      if (input.sku !== undefined) changes.sku = input.sku;
      if (input.attributes !== undefined) changes.attributes = input.attributes;

      const row = await db
        .updateTable('products')
        .set(changes)
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.productId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      if (row === undefined) {
        return null;
      }

      if (input.variants !== undefined) {
        await this.replaceVariants(input.tenantId, row.id, input.variants);
      }

      return this.getProductById(input.tenantId, row.id);
    },

    async replaceVariants(
      tenantId: string,
      productId: string,
      variants: CreateVariantInput[]
    ): Promise<void> {
      await db
        .deleteFrom('product_variants')
        .where('tenant_id', '=', tenantId)
        .where('product_id', '=', productId)
        .execute();

      if (variants.length === 0) {
        return;
      }

      await db
        .insertInto('product_variants')
        .values(
          variants.map((variant) => ({
            id: sql`gen_random_uuid()` as unknown as string,
            tenant_id: tenantId,
            product_id: productId,
            name: variant.name,
            sku: variant.sku ?? null,
            price_amount: variant.priceAmount ?? null,
            stock_quantity: variant.stockQuantity ?? null,
            options: variant.options,
            created_at: sql`now()`,
            updated_at: sql`now()`
          }))
        )
        .execute();
    },

    async softDeleteProduct(
      tenantId: string,
      productId: string
    ): Promise<CatalogProductRecord | null> {
      const row = await db
        .updateTable('products')
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
          status: 'archived'
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', productId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : this.getProductById(tenantId, productId);
    },

    async getProductById(
      tenantId: string,
      productId: string
    ): Promise<CatalogProductRecord | null> {
      const row = await db
        .selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', productId)
        .executeTakeFirst();

      if (row === undefined) {
        return null;
      }

      const [product] = await hydrateProducts(db, [row]);
      return product ?? null;
    },

    async getProductBySlug(tenantId: string, slug: string): Promise<CatalogProductRecord | null> {
      const row = await db
        .selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('slug', '=', slug)
        .executeTakeFirst();

      if (row === undefined) {
        return null;
      }

      const [product] = await hydrateProducts(db, [row]);
      return product ?? null;
    },

    async listProducts(
      tenantId: string,
      filters: ProductListFilters
    ): Promise<{ items: CatalogProductRecord[]; total: number }> {
      const base = db
        .selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .$if(filters.includeDeleted !== true, (query) => query.where('deleted_at', 'is', null))
        .$if(filters.status !== undefined, (query) =>
          query.where('status', '=', filters.status as CatalogStatus)
        );

      const totalRow = await base
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .clearSelect()
        .executeTakeFirstOrThrow();
      const rows = await applyPagination(base.orderBy('updated_at', 'desc'), filters).execute();

      return {
        items: await hydrateProducts(db, rows),
        total: extractCount(totalRow)
      };
    },

    async replaceProductCategories(
      tenantId: string,
      productId: string,
      categoryIds: string[]
    ): Promise<void> {
      await db
        .deleteFrom('product_categories')
        .where('tenant_id', '=', tenantId)
        .where('product_id', '=', productId)
        .execute();

      if (categoryIds.length === 0) {
        return;
      }

      await db
        .insertInto('product_categories')
        .values(
          categoryIds.map((categoryId) => ({
            tenant_id: tenantId,
            product_id: productId,
            category_id: categoryId,
            created_at: sql`now()`
          }))
        )
        .execute();
    },

    async countExistingCategories(tenantId: string, categoryIds: string[]): Promise<number> {
      if (categoryIds.length === 0) {
        return 0;
      }

      const row = await db
        .selectFrom('categories')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('tenant_id', '=', tenantId)
        .where('deleted_at', 'is', null)
        .where('id', 'in', categoryIds)
        .executeTakeFirstOrThrow();

      return extractCount(row);
    },

    async listVisibleCategories(
      tenantId: string,
      filters: Pagination
    ): Promise<PublicCategoryResult> {
      const base = db
        .selectFrom('categories')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('deleted_at', 'is', null)
        .where('is_visible', '=', true);

      const totalRow = await base
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .clearSelect()
        .executeTakeFirstOrThrow();
      const rows = await applyPagination(
        base.orderBy('sort_order', 'asc').orderBy('name', 'asc'),
        filters
      ).execute();

      return {
        items: rows.map(mapCategory),
        total: extractCount(totalRow)
      };
    },

    async getVisibleCategoryBySlug(
      tenantId: string,
      slug: string
    ): Promise<CatalogCategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('slug', '=', slug)
        .where('deleted_at', 'is', null)
        .where('is_visible', '=', true)
        .executeTakeFirst();

      return row === undefined ? null : mapCategory(row);
    },

    async listPublicProducts(
      tenantId: string,
      filters: PublicProductListFilters
    ): Promise<PublicProductResult> {
      const base = db
        .selectFrom('products')
        .$if(filters.categorySlug !== undefined, (query) =>
          query
            .innerJoin('product_categories', 'product_categories.product_id', 'products.id')
            .innerJoin('categories', 'categories.id', 'product_categories.category_id')
            .where('categories.slug', '=', filters.categorySlug as string)
            .where('categories.tenant_id', '=', tenantId)
            .where('categories.deleted_at', 'is', null)
            .where('categories.is_visible', '=', true)
        )
        .selectAll('products')
        .where('products.tenant_id', '=', tenantId)
        .where('products.deleted_at', 'is', null)
        .where('products.status', '=', 'active');

      const totalRow = await base
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .clearSelect()
        .executeTakeFirstOrThrow();
      const rows = await applyPagination(
        base.orderBy('products.updated_at', 'desc'),
        filters
      ).execute();

      return {
        items: await hydrateProducts(db, rows),
        total: extractCount(totalRow)
      };
    },

    async getPublicProductBySlug(
      tenantId: string,
      slug: string
    ): Promise<CatalogProductRecord | null> {
      const row = await db
        .selectFrom('products')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('slug', '=', slug)
        .where('deleted_at', 'is', null)
        .where('status', '=', 'active')
        .executeTakeFirst();

      if (row === undefined) {
        return null;
      }

      const [product] = await hydrateProducts(db, [row]);
      return product ?? null;
    }
  };
};
