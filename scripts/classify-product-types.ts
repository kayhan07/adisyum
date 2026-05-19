import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { inferProductDomainType, isInventoryOnlyProductType, isRawMaterialCategory } from '../lib/product-domain.ts';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      price: true,
      productType: true,
      metadata: true,
      categoryId: true,
    },
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  let changed = 0;
  for (const product of products) {
    const metadata = metadataObject(product.metadata);
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
      await prisma.product.update({
        where: { id: product.id, tenantId: product.tenantId },
        data: {
          productType: nextType,
          metadata: {
            ...metadata,
            productType: nextType,
            productTypeClassifiedAt: new Date().toISOString(),
            productTypeClassifier: 'scripts/classify-product-types.ts',
          },
        },
      });
      changed += 1;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    scanned: products.length,
    changed,
    sellableTypes: ['sale_product', 'combo_product'],
    inventoryOnlyTypes: ['stock_item', 'semi_product'],
  }));
}

main()
  .catch((error) => {
    console.error('[classify-product-types] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
