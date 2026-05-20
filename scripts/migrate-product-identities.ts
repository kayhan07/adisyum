import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { createPosKey, isLegacyRuntimeProductKey, resolveProductIdentity } from '../lib/product-identity.ts';
import { resolvePosFacingProductDomainType } from '../lib/product-domain.ts';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== '0';

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
      productType: true,
      price: true,
      metadata: true,
    },
    orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
  });

  const seen = new Set<string>();
  const updates: Array<{
    id: string;
    tenantId: string;
    name: string;
    fromPosKey: string | null;
    toPosKey: string;
    legacyKey?: string;
    revision: number;
    productType: string;
  }> = [];
  const duplicateCandidates: Array<{ tenantId: string; productId: string; posKey: string; name: string }> = [];

  for (const product of products) {
    const metadata = metadataObject(product.metadata);
    const identity = resolveProductIdentity({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      posKey: product.posKey,
      externalId: product.externalId ?? (typeof metadata.externalId === 'string' ? metadata.externalId : undefined),
      legacyKey: product.legacyKey ?? (typeof metadata.legacyKey === 'string' ? metadata.legacyKey : undefined),
    });

    let nextPosKey = identity.posKey;
    const duplicateKey = `${product.tenantId}:${nextPosKey}`;
    if (seen.has(duplicateKey)) {
      nextPosKey = createPosKey(`${identity.posKey}:${product.id}`);
      duplicateCandidates.push({ tenantId: product.tenantId, productId: product.id, posKey: identity.posKey, name: product.name });
    }
    seen.add(`${product.tenantId}:${nextPosKey}`);

    const nextLegacyKey = product.legacyKey ?? (isLegacyRuntimeProductKey(product.name) ? product.name : identity.legacyKey);
    const nextRevision = Math.max(1, product.revision ?? 1);
    const nextProductType = resolvePosFacingProductDomainType({
      id: product.id,
      posKey: nextPosKey,
      name: product.name,
      productType: product.productType,
      price: product.price.toString(),
    });

    if (product.posKey !== nextPosKey || product.legacyKey !== nextLegacyKey || product.revision !== nextRevision || product.productType !== nextProductType) {
      updates.push({
        id: product.id,
        tenantId: product.tenantId,
        name: product.name,
        fromPosKey: product.posKey,
        toPosKey: nextPosKey,
        legacyKey: nextLegacyKey,
        revision: nextRevision,
        productType: nextProductType,
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    scanned: products.length,
    updates: updates.length,
    duplicateCandidates: duplicateCandidates.length,
    duplicateSample: duplicateCandidates.slice(0, 20),
    sample: updates.slice(0, 30),
  }, null, 2));

  if (DRY_RUN || updates.length === 0) return;

  for (const update of updates) {
    const current = products.find((product) => product.id === update.id);
    const metadata = metadataObject(current?.metadata);
    await prisma.product.update({
      where: { id: update.id, tenantId: update.tenantId },
      data: {
        posKey: update.toPosKey,
        legacyKey: update.legacyKey,
        revision: update.revision,
        productType: update.productType,
        metadata: {
          ...metadata,
          runtimeProductSnapshot: {
            productId: update.id,
            posKey: update.toPosKey,
            name: update.name,
            productType: update.productType,
            revision: update.revision,
            legacyKey: update.legacyKey,
          },
          productIdentityMigration: {
            fromPosKey: update.fromPosKey,
            toPosKey: update.toPosKey,
            legacyKey: update.legacyKey,
            migratedAt: new Date().toISOString(),
            script: 'scripts/migrate-product-identities.ts',
          },
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error('[migrate-product-identities] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
