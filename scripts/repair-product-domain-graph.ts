import { PrismaClient, Prisma } from '@prisma/client';
import { createRequire } from 'node:module';
import { createPosKey, resolveProductIdentity } from '../lib/product-identity';
import {
  CATEGORY_DOMAIN_PRESETS,
  coerceCategoryForProductType,
  getCategoryDomainDefinition,
  normalizeCategoryName,
  normalizeProductTypeForDomainGraph,
  validateProductDomainGraph,
  type ExtendedProductDomainType,
} from '../lib/product-domain-graph';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== '0';

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ProductDomainGraphDb = Pick<PrismaClient, 'productCategory'>;

async function ensureCategory(tenantId: string, name: string, productType: ExtendedProductDomainType, tx: ProductDomainGraphDb = prisma): Promise<string> {
  const normalizedName = normalizeCategoryName(name);
  const existing = await tx.productCategory.findFirst({
    where: { tenantId, name: { equals: normalizedName, mode: 'insensitive' } },
    select: { id: true, name: true, allowedProductTypes: true },
  });
  const definition = getCategoryDomainDefinition(normalizedName);
  const allowed = definition.allowedProductTypes.includes(productType)
    ? definition.allowedProductTypes
    : [productType];

  if (existing) {
    const currentAllowed = Array.isArray(existing.allowedProductTypes) ? existing.allowedProductTypes : [];
    const mergedAllowed = Array.from(new Set([...currentAllowed.filter((item: unknown): item is string => typeof item === 'string'), ...allowed]));
    if (!DRY_RUN && JSON.stringify(currentAllowed) !== JSON.stringify(mergedAllowed)) {
      await tx.productCategory.update({
        where: { id: existing.id },
        data: {
          allowedProductTypes: mergedAllowed as JsonValueLike,
          active: true,
          visibleInPos: definition.visibleInPos,
          visibleInInventory: definition.visibleInInventory,
          visibleInProduction: definition.visibleInProduction,
          deletedAt: null,
          archivedAt: null,
        },
      });
    }
    return existing.id;
  }

  if (DRY_RUN) return `dry-category:${tenantId}:${normalizedName}`;
  const created = await tx.productCategory.create({
    data: {
      tenantId,
      name: normalizedName,
      allowedProductTypes: allowed as JsonValueLike,
      active: true,
      visibleInPos: definition.visibleInPos,
      visibleInInventory: definition.visibleInInventory,
      visibleInProduction: definition.visibleInProduction,
      branchVisibility: {},
      sortOrder: CATEGORY_DOMAIN_PRESETS.findIndex((item) => item.name === normalizedName),
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      sku: true,
      barcode: true,
      posKey: true,
      externalId: true,
      legacyKey: true,
      revision: true,
      lifecycleStatus: true,
      publishStatus: true,
      productType: true,
      categoryId: true,
      price: true,
      active: true,
      deletedAt: true,
      archivedAt: true,
      metadata: true,
    },
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
    take: 50000,
  });

  const categoryIds = [...new Set(products.map((product: { categoryId: string | null }) => product.categoryId).filter((id: string | null): id is string => Boolean(id)))];
  const categories = categoryIds.length
    ? await prisma.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, allowedProductTypes: true } })
    : [];
  const categoryById = new Map(categories.map((category: { id: string; name: string; allowedProductTypes: unknown }): [string, { id: string; name: string; allowedProductTypes: unknown }] => [category.id, category]));

  const tenantIds: string[] = [...new Set<string>(products.map((product: { tenantId: string }) => product.tenantId))];
  const categoryCreates = [];
  for (const tenantId of tenantIds) {
    for (const preset of CATEGORY_DOMAIN_PRESETS) {
      categoryCreates.push({ tenantId, name: preset.name, allowedProductTypes: preset.allowedProductTypes });
    }
  }

  const updates: Array<{
    id: string;
    tenantId: string;
    name: string;
    fromCategory?: string | null;
    toCategory: string;
    fromProductType: string;
    toProductType: ExtendedProductDomainType;
    fromPosKey: string | null;
    toPosKey: string;
    issues: string[];
  }> = [];
  const seenPosKeys = new Set<string>();

  for (const product of products) {
    const metadata = metadataObject(product.metadata);
    const categoryRow = categoryById.get(product.categoryId ?? '');
    const categoryName = categoryRow && typeof categoryRow === 'object' && 'name' in categoryRow && typeof categoryRow.name === 'string'
      ? categoryRow.name
      : undefined;
    const categoryAllowedProductTypes = categoryRow
      && typeof categoryRow === 'object'
      && 'allowedProductTypes' in categoryRow
      ? (categoryRow.allowedProductTypes as unknown)
      : undefined;
    const metadataCategory = typeof metadata.category === 'string' ? metadata.category : undefined;
    const currentCategory = categoryName ?? metadataCategory ?? null;
    const productType = normalizeProductTypeForDomainGraph({
      id: product.id,
      name: product.name,
      category: currentCategory,
      productType: product.productType,
      price: product.price.toString(),
      posKey: product.posKey,
    });
    const nextCategory = coerceCategoryForProductType(currentCategory, productType);
    const identity = resolveProductIdentity({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      posKey: product.posKey,
      externalId: product.externalId,
      legacyKey: product.legacyKey,
    });
    let nextPosKey = identity.posKey;
    const duplicateKey = `${product.tenantId}:${nextPosKey}`;
    if (seenPosKeys.has(duplicateKey)) nextPosKey = createPosKey(`${identity.posKey}:${product.id}`);
    seenPosKeys.add(`${product.tenantId}:${nextPosKey}`);

    const validation = validateProductDomainGraph({
      id: product.id,
      name: product.name,
      category: currentCategory,
      categoryAllowedProductTypes,
      productType: product.productType,
      price: product.price.toString(),
      posKey: product.posKey,
      lifecycleStatus: product.lifecycleStatus,
      publishStatus: product.publishStatus,
      active: product.active,
      deletedAt: product.deletedAt,
      archivedAt: product.archivedAt,
    });

    const categoryChanged = normalizeCategoryName(currentCategory) !== nextCategory;
    const typeChanged = product.productType !== productType;
    const posKeyChanged = product.posKey !== nextPosKey;
    const revisionInvalid = product.revision < 1;
    if (categoryChanged || typeChanged || posKeyChanged || revisionInvalid || validation.issues.length > 0) {
      updates.push({
        id: product.id,
        tenantId: product.tenantId,
        name: product.name,
        fromCategory: currentCategory,
        toCategory: nextCategory,
        fromProductType: product.productType,
        toProductType: productType,
        fromPosKey: product.posKey,
        toPosKey: nextPosKey,
        issues: validation.issues.map((issue: { code: string }) => issue.code),
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    scanned: products.length,
    tenantCount: tenantIds.length,
    presetCategories: categoryCreates.length,
    updates: updates.length,
    sample: updates.slice(0, 40),
  }, null, 2));

  if (DRY_RUN) return;

  for (const tenantId of tenantIds) {
    for (const preset of CATEGORY_DOMAIN_PRESETS) {
      await ensureCategory(tenantId, preset.name, preset.allowedProductTypes[0]);
    }
  }

  for (const update of updates) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const categoryId = await ensureCategory(update.tenantId, update.toCategory, update.toProductType, tx);
      const current = products.find((product: { id: string }) => product.id === update.id);
      const metadata = metadataObject(current?.metadata);
      await tx.product.update({
        where: { id: update.id },
        data: {
          categoryId: categoryId.startsWith('dry-category:') ? undefined : categoryId,
          productType: update.toProductType,
          posKey: update.toPosKey,
          legacyKey: current?.legacyKey ?? current?.name,
          revision: Math.max(1, current?.revision ?? 1),
          metadata: {
            ...metadata,
            category: update.toCategory,
            runtimeProductSnapshot: {
              productId: update.id,
              posKey: update.toPosKey,
              name: update.name,
              category: update.toCategory,
              productType: update.toProductType,
              revision: Math.max(1, current?.revision ?? 1),
            },
            productDomainGraphRepair: {
              fromCategory: update.fromCategory,
              toCategory: update.toCategory,
              fromProductType: update.fromProductType,
              toProductType: update.toProductType,
              fromPosKey: update.fromPosKey,
              toPosKey: update.toPosKey,
              issues: update.issues,
              repairedAt: new Date().toISOString(),
              script: 'scripts/repair-product-domain-graph.ts',
            },
          },
        },
      });
      await tx.runtimeState.deleteMany({ where: { tenantId: update.tenantId, key: { startsWith: 'runtime:pos-catalog' } } }).catch(() => undefined);
    });
  }
}

main()
  .catch((error) => {
    console.error('[repair-product-domain-graph] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
