import type { CatalogCategoryRecord, CatalogProductRecord } from '../../persistence/CatalogRepoPg';

export const mapCategoryDto = (category: CatalogCategoryRecord) => ({
  id: category.id,
  tenant_id: category.tenantId,
  name: category.name,
  slug: category.slug,
  description: category.description,
  sort_order: category.sortOrder,
  is_visible: category.isVisible,
  created_at: category.createdAt.toISOString(),
  updated_at: category.updatedAt.toISOString()
});

export const mapProductDto = (product: CatalogProductRecord) => ({
  id: product.id,
  tenant_id: product.tenantId,
  name: product.name,
  slug: product.slug,
  description: product.description,
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
  variants: product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price_amount: variant.priceAmount,
    stock_quantity: variant.stockQuantity,
    options: variant.options
  })),
  created_at: product.createdAt.toISOString(),
  updated_at: product.updatedAt.toISOString()
});

export const mapStorefrontCategoryDto = (category: CatalogCategoryRecord) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  sort_order: category.sortOrder
});

export const mapStorefrontProductDto = (product: CatalogProductRecord) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  description: product.description,
  primary_image_asset_id: product.primaryImageAssetId,
  price_amount: product.priceAmount,
  compare_at_price_amount: product.compareAtPriceAmount,
  currency: product.currency,
  sku: product.sku,
  attributes: product.attributes,
  variants: product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price_amount: variant.priceAmount,
    stock_quantity: variant.stockQuantity,
    options: variant.options
  })),
  category_ids: product.categoryIds
});
