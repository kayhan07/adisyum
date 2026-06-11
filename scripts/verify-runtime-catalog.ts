import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { compileTenantPosCatalog } from '../lib/server/runtime-pos-catalog';
import { isSellableProductType } from '../lib/product-domain';
import { validateProductDomainGraph } from '../lib/product-domain-graph';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main() {
  const tenantFilter = process.env.PRODUCT_VERIFY_TENANT_ID;
  const tenants = tenantFilter
    ? [{ tenantId: tenantFilter }]
    : await prisma.product.findMany({
        distinct: ['tenantId'],
        select: { tenantId: true },
        orderBy: { tenantId: 'asc' },
      });

  const results = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const tenant of tenants) {
    const catalog = await compileTenantPosCatalog(tenant.tenantId, process.env.PRODUCT_VERIFY_BRANCH_ID, 'pos');
    const products = await prisma.product.findMany({
      where: { tenantId: tenant.tenantId, active: true, deletedAt: null },
      select: { id: true, name: true, posKey: true, revision: true, productType: true, price: true, categoryId: true, active: true, deletedAt: true, archivedAt: true, lifecycleStatus: true, publishStatus: true, metadata: true },
      orderBy: [{ productType: 'asc' }, { name: 'asc' }],
      take: 10000,
    });

    const saleProducts = products.filter((product: { productType: string }) => product.productType === 'sale_product');
    const comboProducts = products.filter((product: { productType: string }) => product.productType === 'combo_product');
    const stockItemsInCatalog = catalog.items.filter((item: { productType: string }) => item.productType === 'stock_item' || item.productType === 'semi_product');
    const missingFields = catalog.items.filter((item: { posKey: string; catalogRevision: string; productSnapshot: unknown; price: number }) => {
      const snapshot = metadataObject(item.productSnapshot);
      return !item.posKey
        || !item.catalogRevision
        || !item.productSnapshot
        || !Number.isFinite(item.price)
        || !catalog.tenantId
        || !snapshot.posKey
        || snapshot.posKey !== item.posKey;
    });
    const nonSellable = catalog.items.filter((item: { productType: string }) => !isSellableProductType(item.productType));
    const categoryIds = [...new Set(products.map((product: { categoryId: string | null }) => product.categoryId).filter((id: string | null): id is string => Boolean(id)))];
    const categories = categoryIds.length
      ? await prisma.productCategory.findMany({ where: { tenantId: tenant.tenantId, id: { in: categoryIds } }, select: { id: true, name: true, allowedProductTypes: true } })
      : [];
    const categoryById = new Map(categories.map((category: { id: string; name: string; allowedProductTypes: unknown }): [string, { id: string; name: string; allowedProductTypes: unknown }] => [category.id, category]));
    const invalidDomainGraph = products.filter((product: {
      id: string;
      name: string;
      categoryId: string | null;
      productType: string;
      price: { toString(): string };
      posKey: string | null;
      lifecycleStatus: string;
      publishStatus: string;
      active: boolean;
      deletedAt: Date | null;
      archivedAt: Date | null;
    }) => {
      const category = categoryById.get(product.categoryId ?? '');
      const categoryName = category && typeof category === 'object' && 'name' in category && typeof category.name === 'string'
        ? category.name
        : undefined;
      const categoryAllowedProductTypes = category
        && typeof category === 'object'
        && 'allowedProductTypes' in category
        ? category.allowedProductTypes
        : undefined;
      return !validateProductDomainGraph({
        id: product.id,
        name: product.name,
        category: categoryName,
        categoryAllowedProductTypes,
        productType: product.productType,
        price: product.price.toString(),
        posKey: product.posKey,
        lifecycleStatus: product.lifecycleStatus,
        publishStatus: product.publishStatus,
        active: product.active,
        deletedAt: product.deletedAt,
        archivedAt: product.archivedAt,
      }).ok;
    });
    const invalidRuntimeSnapshots = catalog.items.filter((item) => !validateProductDomainGraph({
      id: item.productSnapshot.productId,
      name: item.productSnapshot.name,
      category: item.productSnapshot.category,
      productType: item.productSnapshot.productType,
      price: item.productSnapshot.price,
      posKey: item.posKey,
      catalogRevision: item.catalogRevision,
      productSnapshot: item.productSnapshot,
      lifecycleStatus: item.productSnapshot.lifecycleStatus,
      publishStatus: item.productSnapshot.publishStatus,
    }, { requireRuntimeFields: true }).runtimeVisible);

    if (saleProducts.length === 0) errors.push(`${tenant.tenantId}: no active sale products found`);
    if (process.env.REQUIRE_COMBO_PRODUCTS === '1' && comboProducts.length === 0) errors.push(`${tenant.tenantId}: no active combo products found`);
    if (comboProducts.length === 0) warnings.push(`${tenant.tenantId}: no active combo products found`);
    if (stockItemsInCatalog.length > 0) errors.push(`${tenant.tenantId}: inventory-only products leaked into POS catalog`);
    if (missingFields.length > 0) errors.push(`${tenant.tenantId}: ${missingFields.length} catalog items missing runtime contract fields`);
    if (nonSellable.length > 0) errors.push(`${tenant.tenantId}: ${nonSellable.length} non-sellable catalog items found`);
    if (invalidDomainGraph.length > 0) errors.push(`${tenant.tenantId}: ${invalidDomainGraph.length} products violate category/productType governance`);
    if (invalidRuntimeSnapshots.length > 0) errors.push(`${tenant.tenantId}: ${invalidRuntimeSnapshots.length} runtime snapshots are malformed`);
    assert.equal(catalog.items.every((item: { catalogRevision: string }) => item.catalogRevision === catalog.catalogRevision), true);

    results.push({
      tenantId: tenant.tenantId,
      catalogRevision: catalog.catalogRevision,
      checksum: catalog.checksum,
      itemCount: catalog.itemCount,
      saleProducts: saleProducts.length,
      comboProducts: comboProducts.length,
      stockItemsExcluded: products.filter((product: { productType: string }) => product.productType === 'stock_item' || product.productType === 'semi_product').length,
      invalidCatalogItems: catalog.observability.invalidItemCount,
      missingFields: missingFields.length,
      invalidDomainGraph: invalidDomainGraph.length,
      invalidRuntimeSnapshots: invalidRuntimeSnapshots.length,
    });
  }

  console.log(JSON.stringify({ ok: errors.length === 0, results, warnings, errors }, null, 2));
  if (errors.length > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error('[verify-runtime-catalog] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
