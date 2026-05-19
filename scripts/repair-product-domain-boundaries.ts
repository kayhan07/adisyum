import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import {
  inferProductDomainType,
  isInventoryOnlyProductType,
  isRawMaterialCategory,
  isSellableProductType,
} from '../lib/product-domain';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');
loadEnvFile('.env.production');

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== '0';

function normalizeMetadata(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      price: true,
      productType: true,
      categoryId: true,
      metadata: true,
    },
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const fixes: Array<{ id: string; tenantId: string; name: string; from: string; to: string; reason: string }> = [];

  for (const product of products) {
    const metadata = normalizeMetadata(product.metadata);
    const category = categoryById.get(product.categoryId ?? '') ?? (typeof metadata.category === 'string' ? metadata.category : null);
    const price = Number(product.price);
    const suspiciousInventoryType = isInventoryOnlyProductType(product.productType)
      && Boolean(category)
      && !isRawMaterialCategory(category)
      && Number.isFinite(price)
      && price > 0;
    const explicit = suspiciousInventoryType
      ? null
      : typeof metadata.productType === 'string'
        ? metadata.productType
        : product.productType;
    const nextType = inferProductDomainType({
      name: product.name,
      category,
      explicitType: explicit,
    });

    if (nextType !== product.productType) {
      fixes.push({
        id: product.id,
        tenantId: product.tenantId,
        name: product.name,
        from: product.productType,
        to: nextType,
        reason: isSellableProductType(nextType) ? 'sellable product normalization' : 'inventory-only boundary repair',
      });
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    scanned: products.length,
    fixes: fixes.length,
    sample: fixes.slice(0, 50),
  }, null, 2));

  if (DRY_RUN || fixes.length === 0) return;

  for (const fix of fixes) {
    const current = products.find((product) => product.id === fix.id);
    const metadata = normalizeMetadata(current?.metadata);
    await prisma.product.update({
      where: { id: fix.id },
      data: {
        productType: fix.to,
        metadata: {
          ...metadata,
          productDomainRepair: {
            from: fix.from,
            to: fix.to,
            reason: fix.reason,
            repairedAt: new Date().toISOString(),
            script: 'scripts/repair-product-domain-boundaries.ts',
          },
        },
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
