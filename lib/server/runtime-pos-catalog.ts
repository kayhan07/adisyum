import { compileCanonicalPosCatalog, type CanonicalPosCatalog, type CatalogChannel } from '@/lib/canonical-pos-catalog';
import { prisma } from '@/lib/db/prisma';
import { resolvePosFacingProductDomainType } from '@/lib/product-domain';
import { validateProductDomainGraph } from '@/lib/product-domain-graph';
import { resolveProductIdentity } from '@/lib/product-identity';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

export const RUNTIME_POS_CATALOG_KEY = 'runtime:pos-catalog';

export function readRuntimeCatalogChannel(value: string | null | undefined): CatalogChannel {
  if (value === 'qr' || value === 'kiosk' || value === 'delivery' || value === 'waiter_tablet' || value === 'mobile_pos') return value;
  return 'pos';
}

function resolveBranchCategoryVisibility(value: JsonValueLike | undefined, branchId?: string) {
  if (!branchId || !value || typeof value !== 'object' || Array.isArray(value)) return true;
  const visibility = value as Record<string, unknown>;
  const branchValue = visibility[branchId];
  if (typeof branchValue === 'boolean') return branchValue;
  if (branchValue && typeof branchValue === 'object' && !Array.isArray(branchValue)) {
    const enabled = (branchValue as Record<string, unknown>).enabled;
    if (typeof enabled === 'boolean') return enabled;
  }
  return true;
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

  const categoryIds = [...new Set(products.map((product: { categoryId: string | null }) => product.categoryId).filter((id: string | null): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({
        where: { tenantId, id: { in: categoryIds }, active: true, deletedAt: null },
        select: { id: true, name: true, allowedProductTypes: true, visibleInPos: true, visibleInInventory: true, visibleInProduction: true, branchVisibility: true },
      })
    : [];
  const categoryById = new Map<string, { id: string; name: string; allowedProductTypes: unknown; visibleInPos: boolean; visibleInInventory: boolean; visibleInProduction: boolean; branchVisibility: JsonValueLike | null }>(
    categories.map((category: { id: string; name: string; allowedProductTypes: unknown; visibleInPos: boolean; visibleInInventory: boolean; visibleInProduction: boolean; branchVisibility: JsonValueLike | null }) => [category.id, category]),
  );

  const items = products.flatMap((product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    posKey: string | null;
    externalId: string | null;
    legacyKey: string | null;
    revision: number;
    lifecycleStatus: string;
    publishStatus: string;
    deletedAt: Date | null;
    price: { toString(): string };
    vatRate: number;
    unitType: string;
    productType: string;
    categoryId: string | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    description: string | null;
  }) => {
    const categoryRow = categoryById.get(product.categoryId ?? '');
    const category = categoryRow?.name ?? 'Mutfak';
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
    const graph = validateProductDomainGraph({
      id: product.id,
      name: product.name,
      category,
      categoryId: product.categoryId,
      categoryAllowedProductTypes: categoryRow?.allowedProductTypes,
      productType,
      price: product.price.toString(),
      posKey: identity.posKey,
      lifecycleStatus: product.lifecycleStatus,
      publishStatus: product.publishStatus,
      active: true,
      deletedAt: product.deletedAt,
      branchId,
      branchVisible: resolveBranchCategoryVisibility(categoryRow?.branchVisibility, branchId),
    });
    if (!graph.runtimeVisible) {
      console.error('[runtime-pos-catalog] product rejected by domain graph', {
        tenantId,
        branchId,
        productId: product.id,
        posKey: identity.posKey,
        name: product.name,
        category,
        productType,
        issues: graph.issues,
      });
      return [];
    }
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

export function cloneCatalogForRuntimeState(catalog: CanonicalPosCatalog): JsonValueLike {
  return JSON.parse(JSON.stringify(catalog)) as JsonValueLike;
}

export async function invalidateRuntimePosCatalog(tenantId: string, reason: string, branchId?: string) {
  const deleted = await prisma.runtimeState.deleteMany({
    where: {
      tenantId,
      key: branchId
        ? { startsWith: `${RUNTIME_POS_CATALOG_KEY}:${branchId}:` }
        : { startsWith: RUNTIME_POS_CATALOG_KEY },
    },
  }).catch((error: unknown) => {
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
