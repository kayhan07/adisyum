import { Prisma } from '@prisma/client';
import { compileCanonicalPosCatalog, type CanonicalPosCatalog, type CatalogChannel } from '@/lib/canonical-pos-catalog';
import { prisma } from '@/lib/db/prisma';
import { resolvePosFacingProductDomainType } from '@/lib/product-domain';
import { resolveProductIdentity } from '@/lib/product-identity';

export const RUNTIME_POS_CATALOG_KEY = 'runtime:pos-catalog';

export function readRuntimeCatalogChannel(value: string | null | undefined): CatalogChannel {
  if (value === 'qr' || value === 'kiosk' || value === 'delivery' || value === 'waiter_tablet' || value === 'mobile_pos') return value;
  return 'pos';
}

export async function compileTenantPosCatalog(tenantId: string, branchId?: string, channel: CatalogChannel = 'pos'): Promise<CanonicalPosCatalog> {
  const products = await prisma.product.findMany({
    where: {
      tenantId,
      active: true,
      deletedAt: null,
      lifecycleStatus: { in: ['active', 'published'] },
      publishStatus: 'published',
      productType: { in: ['sale_product', 'combo_product'] },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      posKey: true,
      externalId: true,
      legacyKey: true,
      revision: true,
      lifecycleStatus: true,
      publishStatus: true,
      deletedAt: true,
      price: true,
      vatRate: true,
      unitType: true,
      productType: true,
      categoryId: true,
      imageUrl: true,
      thumbnailUrl: true,
      description: true,
    },
    take: 10000,
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { tenantId, id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const items = products.map((product) => {
    const category = categoryById.get(product.categoryId ?? '') ?? 'Mutfak';
    const identity = resolveProductIdentity({
      id: product.id,
      posKey: product.posKey,
      sku: product.sku,
      barcode: product.barcode,
      externalId: product.externalId,
      legacyKey: product.legacyKey,
      name: product.name,
    });
    const productType = resolvePosFacingProductDomainType({
      id: product.id,
      posKey: identity.posKey,
      name: product.name,
      category,
      productType: product.productType,
      price: product.price.toString(),
    });
    return {
      id: identity.posKey,
      productId: product.id,
      posKey: identity.posKey,
      sku: product.sku ?? undefined,
      barcode: product.barcode ?? undefined,
      externalId: product.externalId ?? undefined,
      legacyKey: product.legacyKey ?? product.name,
      revision: product.revision,
      lifecycleStatus: product.lifecycleStatus as 'active' | 'published',
      publishStatus: product.publishStatus as 'published',
      deletedAt: product.deletedAt?.toISOString() ?? null,
      name: product.name,
      category,
      productType,
      printCategory: category,
      salesUnit: product.unitType === 'kg' ? 'kg' as const : 'portion' as const,
      price: Number(product.price),
      vatRate: product.vatRate,
      allowComplimentary: true,
      allowDiscount: true,
      happyHourEligible: true,
      imageUrl: product.imageUrl ?? undefined,
      thumbnailUrl: product.thumbnailUrl ?? undefined,
      description: product.description ?? undefined,
    };
  });

  return compileCanonicalPosCatalog(items, {
    tenantId,
    branchId,
    channel,
    status: 'published',
  });
}

export function cloneCatalogForRuntimeState(catalog: CanonicalPosCatalog): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(catalog)) as Prisma.InputJsonValue;
}

export async function invalidateRuntimePosCatalog(tenantId: string, reason: string, branchId?: string) {
  const deleted = await prisma.runtimeState.deleteMany({
    where: {
      tenantId,
      key: branchId
        ? { startsWith: `${RUNTIME_POS_CATALOG_KEY}:${branchId}:` }
        : { startsWith: RUNTIME_POS_CATALOG_KEY },
    },
  }).catch((error) => {
    console.error('[runtime-pos-catalog] cache invalidation failed', {
      tenantId,
      branchId,
      reason,
      error,
    });
    return { count: 0 };
  });

  console.info('[runtime-pos-catalog] cache invalidated', {
    timestamp: new Date().toISOString(),
    tenantId,
    branchId,
    reason,
    deleted: deleted.count,
  });
  return deleted.count;
}
