import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import type { TenantRepository } from '../../tenancy/persistence/TenantRepository';
import type { ReturnTypeCatalogUseCases } from '../index';
import {
  catalogCategoryParamsSchema,
  catalogProductParamsSchema,
  createCategoryBodySchema,
  createProductBodySchema,
  listCatalogQuerySchema,
  parseCatalogValidation,
  publicListQuerySchema,
  replaceProductCategoriesBodySchema,
  storefrontCategoryParamsSchema,
  storefrontProductParamsSchema,
  storefrontTenantParamsSchema,
  tenantIdParamsSchema,
  updateCategoryBodySchema,
  updateProductBodySchema
} from './schemas/catalogSchemas';
import {
  mapCategoryDto,
  mapProductDto,
  mapStorefrontCategoryDto,
  mapStorefrontProductDto
} from './controllers/mappers';

export type CatalogApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  tenantRepo: TenantRepository;
  useCases: ReturnTypeCatalogUseCases;
};

const normalizeVariants = (
  variants:
    | Array<{
        name: string;
        sku?: string | null | undefined;
        price_amount?: number | null | undefined;
        stock_quantity?: number | null | undefined;
        options: Record<string, unknown>;
      }>
    | undefined
) => {
  if (variants === undefined) {
    return undefined;
  }

  return variants.map((variant) => {
    const normalized = {
      name: variant.name,
      options: variant.options
    };

    return {
      ...normalized,
      ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
      ...(variant.price_amount !== undefined ? { price_amount: variant.price_amount } : {}),
      ...(variant.stock_quantity !== undefined ? { stock_quantity: variant.stock_quantity } : {})
    };
  });
};

const resolveTenantIdBySlug = async (
  tenantRepo: TenantRepository,
  tenantSlug: string
): Promise<string> => {
  const tenant = await tenantRepo.findBySlug(tenantSlug);
  if (tenant === null) {
    throw new AppError({
      code: ErrorCode.TenantResolutionFailed,
      message: 'Tenant not found'
    });
  }

  return tenant.id;
};

const getTenantId = (request: FastifyRequest): string => {
  const tenantId = request.tenant?.tenantId;
  if (tenantId === undefined) {
    throw new Error('tenant context is required');
  }

  return tenantId;
};

const getActorUserId = (request: FastifyRequest): string => {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new Error('auth context is required');
  }

  return userId;
};

export const registerCatalogApiRoutes = async (
  server: FastifyInstance,
  deps: CatalogApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'catalog' }, 'registering CAT routes');

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });
  const tenantOwnerGuard = requireTenantOwner({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post(
    '/tenants/:tenantId/categories',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      parseCatalogValidation(tenantIdParamsSchema.safeParse(request.params));
      const body = parseCatalogValidation(createCategoryBodySchema.safeParse(request.body));
      const category = await deps.useCases.createCategory({
        tenantId: getTenantId(request),
        actorUserId: getActorUserId(request),
        requestId: request.id,
        name: body.name,
        slug: body.slug,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        ...(body.is_visible !== undefined ? { isVisible: body.is_visible } : {})
      });

      return { category: mapCategoryDto(category) };
    }
  );

  server.patch(
    '/tenants/:tenantId/categories/:categoryId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseCatalogValidation(catalogCategoryParamsSchema.safeParse(request.params));
      const body = parseCatalogValidation(updateCategoryBodySchema.safeParse(request.body));
      const category = await deps.useCases.updateCategory({
        tenantId: getTenantId(request),
        categoryId: params.categoryId,
        actorUserId: getActorUserId(request),
        requestId: request.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        ...(body.is_visible !== undefined ? { isVisible: body.is_visible } : {})
      });

      return { category: mapCategoryDto(category) };
    }
  );

  server.delete(
    '/tenants/:tenantId/categories/:categoryId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseCatalogValidation(catalogCategoryParamsSchema.safeParse(request.params));
      const category = await deps.useCases.deleteCategory({
        tenantId: getTenantId(request),
        categoryId: params.categoryId,
        actorUserId: getActorUserId(request),
        requestId: request.id
      });

      return { category: mapCategoryDto(category) };
    }
  );

  server.get('/tenants/:tenantId/categories', { preHandler: tenantGuard }, async (request) => {
    parseCatalogValidation(tenantIdParamsSchema.safeParse(request.params));
    const query = parseCatalogValidation(listCatalogQuerySchema.safeParse(request.query));
    const result = await deps.useCases.listCategories({
      tenantId: getTenantId(request),
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.page_size !== undefined ? { pageSize: query.page_size } : {}),
      ...(query.include_deleted !== undefined ? { includeDeleted: query.include_deleted } : {}),
      ...(query.is_visible !== undefined ? { isVisible: query.is_visible } : {})
    });

    return {
      categories: result.items.map(mapCategoryDto),
      pagination: {
        page: query.page ?? 1,
        page_size: query.page_size ?? 20,
        total: result.total
      }
    };
  });

  server.post('/tenants/:tenantId/products', { preHandler: tenantOwnerGuard }, async (request) => {
    parseCatalogValidation(tenantIdParamsSchema.safeParse(request.params));
    const body = parseCatalogValidation(createProductBodySchema.safeParse(request.body));
    const variants = normalizeVariants(body.variants);
    const product = await deps.useCases.createProduct({
      tenantId: getTenantId(request),
      actorUserId: getActorUserId(request),
      requestId: request.id,
      name: body.name,
      slug: body.slug,
      status: body.status,
      priceAmount: body.price_amount,
      currency: body.currency,
      trackInventory: body.track_inventory,
      stockQuantity: body.stock_quantity,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.primary_image_asset_id !== undefined
        ? { primaryImageAssetId: body.primary_image_asset_id }
        : {}),
      ...(body.compare_at_price_amount !== undefined
        ? { compareAtPriceAmount: body.compare_at_price_amount }
        : {}),
      ...(body.sku !== undefined ? { sku: body.sku } : {}),
      ...(body.attributes !== undefined ? { attributes: body.attributes } : {}),
      ...(variants !== undefined ? { variants } : {})
    });

    return { product: mapProductDto(product) };
  });

  server.patch(
    '/tenants/:tenantId/products/:productId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseCatalogValidation(catalogProductParamsSchema.safeParse(request.params));
      const body = parseCatalogValidation(updateProductBodySchema.safeParse(request.body));
      const variants = normalizeVariants(body.variants);
      const product = await deps.useCases.updateProduct({
        tenantId: getTenantId(request),
        productId: params.productId,
        actorUserId: getActorUserId(request),
        requestId: request.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.primary_image_asset_id !== undefined
          ? { primaryImageAssetId: body.primary_image_asset_id }
          : {}),
        ...(body.price_amount !== undefined ? { priceAmount: body.price_amount } : {}),
        ...(body.compare_at_price_amount !== undefined
          ? { compareAtPriceAmount: body.compare_at_price_amount }
          : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.track_inventory !== undefined ? { trackInventory: body.track_inventory } : {}),
        ...(body.stock_quantity !== undefined ? { stockQuantity: body.stock_quantity } : {}),
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.attributes !== undefined ? { attributes: body.attributes } : {}),
        ...(variants !== undefined ? { variants } : {})
      });

      return { product: mapProductDto(product) };
    }
  );

  server.delete(
    '/tenants/:tenantId/products/:productId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseCatalogValidation(catalogProductParamsSchema.safeParse(request.params));
      const product = await deps.useCases.deleteProduct({
        tenantId: getTenantId(request),
        productId: params.productId,
        actorUserId: getActorUserId(request),
        requestId: request.id
      });

      return { product: mapProductDto(product) };
    }
  );

  server.get('/tenants/:tenantId/products', { preHandler: tenantGuard }, async (request) => {
    parseCatalogValidation(tenantIdParamsSchema.safeParse(request.params));
    const query = parseCatalogValidation(listCatalogQuerySchema.safeParse(request.query));
    const result = await deps.useCases.listProducts({
      tenantId: getTenantId(request),
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.page_size !== undefined ? { pageSize: query.page_size } : {}),
      ...(query.include_deleted !== undefined ? { includeDeleted: query.include_deleted } : {}),
      ...(query.status !== undefined ? { status: query.status } : {})
    });

    return {
      products: result.items.map(mapProductDto),
      pagination: {
        page: query.page ?? 1,
        page_size: query.page_size ?? 20,
        total: result.total
      }
    };
  });

  server.put(
    '/tenants/:tenantId/products/:productId/categories',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseCatalogValidation(catalogProductParamsSchema.safeParse(request.params));
      const body = parseCatalogValidation(
        replaceProductCategoriesBodySchema.safeParse(request.body)
      );
      const product = await deps.useCases.assignCategories({
        tenantId: getTenantId(request),
        productId: params.productId,
        actorUserId: getActorUserId(request),
        requestId: request.id,
        categoryIds: body.category_ids
      });

      return { product: mapProductDto(product) };
    }
  );

  server.get('/storefront/:tenantSlug/categories', async (request) => {
    const params = parseCatalogValidation(storefrontTenantParamsSchema.safeParse(request.params));
    const query = parseCatalogValidation(publicListQuerySchema.safeParse(request.query));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);
    const result = await deps.useCases.listStorefrontCategories({
      tenantId,
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.page_size !== undefined ? { pageSize: query.page_size } : {})
    });

    return {
      categories: result.items.map(mapStorefrontCategoryDto),
      pagination: {
        page: query.page ?? 1,
        page_size: query.page_size ?? 20,
        total: result.total
      }
    };
  });

  server.get('/storefront/:tenantSlug/categories/:categorySlug', async (request) => {
    const params = parseCatalogValidation(storefrontCategoryParamsSchema.safeParse(request.params));
    const query = parseCatalogValidation(publicListQuerySchema.safeParse(request.query));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);
    const result = await deps.useCases.getStorefrontCategory({
      tenantId,
      categorySlug: params.categorySlug,
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.page_size !== undefined ? { pageSize: query.page_size } : {})
    });

    return {
      category: mapStorefrontCategoryDto(result.category),
      products: result.products.items.map(mapStorefrontProductDto),
      pagination: {
        page: query.page ?? 1,
        page_size: query.page_size ?? 20,
        total: result.products.total
      }
    };
  });

  server.get('/storefront/:tenantSlug/products', async (request) => {
    const params = parseCatalogValidation(storefrontTenantParamsSchema.safeParse(request.params));
    const query = parseCatalogValidation(publicListQuerySchema.safeParse(request.query));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);
    const result = await deps.useCases.listStorefrontProducts({
      tenantId,
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.page_size !== undefined ? { pageSize: query.page_size } : {})
    });

    return {
      products: result.items.map(mapStorefrontProductDto),
      pagination: {
        page: query.page ?? 1,
        page_size: query.page_size ?? 20,
        total: result.total
      }
    };
  });

  server.get('/storefront/:tenantSlug/products/:productSlug', async (request) => {
    const params = parseCatalogValidation(storefrontProductParamsSchema.safeParse(request.params));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);
    const product = await deps.useCases.getStorefrontProduct({
      tenantId,
      productSlug: params.productSlug
    });

    return { product: mapStorefrontProductDto(product) };
  });
};
