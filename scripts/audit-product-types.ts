import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import {
  isInventoryOnlyProductType,
  isRawMaterialCategory,
  isSellableProductType,
  resolvePosFacingProductDomainType,
} from '../lib/product-domain.ts';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();

async function main() {
  const grouped = await prisma.product.groupBy({
    by: ['productType'],
    _count: { _all: true },
    orderBy: { productType: 'asc' },
  });

  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      tenantId: true,
      name: true,
      categoryId: true,
      price: true,
      posKey: true,
      sku: true,
      barcode: true,
      externalId: true,
      legacyKey: true,
      revision: true,
      productType: true,
    },
    take: 10000,
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length
    ? await prisma.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const sellable = [];
  const blocked = [];
  const suspiciousLegacy = [];
  const missingPosKey = [];
  const duplicateRuntimeKeys = new Map<string, typeof products>();
  const duplicateBarcodes = new Map<string, typeof products>();

  for (const product of products) {
    const category = categoryById.get(product.categoryId ?? '') ?? null;
    const resolvedType = resolvePosFacingProductDomainType({
      id: product.id,
      name: product.name,
      category,
      productType: product.productType,
      price: product.price.toString(),
    });

    if (isSellableProductType(resolvedType)) sellable.push({ ...product, category, resolvedType });
    if (isInventoryOnlyProductType(resolvedType)) blocked.push({ ...product, category, resolvedType });
    if (
      isInventoryOnlyProductType(product.productType)
      && category
      && !isRawMaterialCategory(category)
      && Number(product.price) > 0
      && isSellableProductType(resolvedType)
    ) {
      suspiciousLegacy.push({ ...product, category, resolvedType });
    }

    if (!product.posKey) missingPosKey.push({ ...product, category, resolvedType });
    if (product.posKey) {
      const key = `${product.tenantId}:${product.posKey}`;
      const current = duplicateRuntimeKeys.get(key) ?? [];
      current.push(product);
      duplicateRuntimeKeys.set(key, current);
    }
    if (product.barcode) {
      const key = `${product.tenantId}:${product.barcode}`;
      const current = duplicateBarcodes.get(key) ?? [];
      current.push(product);
      duplicateBarcodes.set(key, current);
    }
  }

  const duplicatedPosKeys = [...duplicateRuntimeKeys.entries()].filter(([, entries]) => entries.length > 1);
  const duplicatedBarcodes = [...duplicateBarcodes.entries()].filter(([, entries]) => entries.length > 1);

  console.log(JSON.stringify({
    ok: true,
    groupedProductTypes: grouped.map((row) => ({ productType: row.productType, count: row._count._all })),
    activeProductsScanned: products.length,
    posVisibleAfterFailsafe: sellable.length,
    inventoryBlocked: blocked.length,
    suspiciousLegacySellable: suspiciousLegacy.length,
    missingPosKey: missingPosKey.length,
    duplicatedPosKeys: duplicatedPosKeys.length,
    duplicatedBarcodes: duplicatedBarcodes.length,
    suspiciousLegacySample: suspiciousLegacy.slice(0, 30).map((product) => ({
      tenantId: product.tenantId,
      id: product.id,
      name: product.name,
      category: product.category,
      productType: product.productType,
      resolvedType: product.resolvedType,
    })),
    missingPosKeySample: missingPosKey.slice(0, 30).map((product) => ({
      tenantId: product.tenantId,
      id: product.id,
      name: product.name,
      category: product.category,
      productType: product.productType,
      resolvedType: product.resolvedType,
    })),
    duplicatedPosKeySample: duplicatedPosKeys.slice(0, 10).map(([key, entries]) => ({
      key,
      products: entries.map((product) => ({ id: product.id, name: product.name })),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[audit-product-types] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
