import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { compileTenantPosCatalog } from '../lib/server/runtime-pos-catalog';
import { isSellableProductType } from '../lib/product-domain';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const prisma = new PrismaClient();
const VAT_RATE = 0.1;

function tableOrderNo(tableId: string) {
  return `TABLE-${tableId}`;
}

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main() {
  const tenantId = process.env.POS_TRACE_TENANT_ID
    ?? (await prisma.product.findFirst({ select: { tenantId: true }, orderBy: { createdAt: 'asc' } }))?.tenantId;
  if (!tenantId) throw new Error('No tenant found. Set POS_TRACE_TENANT_ID.');

  const branchId = process.env.POS_TRACE_BRANCH_ID;
  const tableId = process.env.POS_TRACE_TABLE_ID ?? 'TRACE-RUNTIME';
  const catalog = await compileTenantPosCatalog(tenantId, branchId, 'pos');
  const requestedPosKey = process.env.POS_TRACE_POS_KEY;
  const item = requestedPosKey
    ? catalog.items.find((candidate) => candidate.posKey === requestedPosKey)
    : catalog.items[0];

  if (!item) {
    throw new Error(`No runtime catalog item found for tenant=${tenantId} posKey=${requestedPosKey ?? '(first)'}`);
  }
  if (!isSellableProductType(item.productSnapshot.productType)) {
    throw new Error(`Runtime resolver rejected non-sellable productType=${item.productSnapshot.productType}`);
  }
  if (item.catalogRevision !== catalog.catalogRevision) {
    throw new Error(`Catalog revision mismatch item=${item.catalogRevision} catalog=${catalog.catalogRevision}`);
  }
  if (item.productSnapshot.posKey !== item.posKey) {
    throw new Error(`Snapshot posKey mismatch item=${item.posKey} snapshot=${item.productSnapshot.posKey}`);
  }

  const mutationId = `trace-${Date.now()}`;
  const orderNo = tableOrderNo(tableId);
  let orderId = '';
  let itemId = '';

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.upsert({
      where: { tenantId_orderNo: { tenantId, orderNo } },
      update: {
        status: 'open',
        metadata: { tableKey: tableId, source: 'products:trace-pos-insertion', lastMutationId: mutationId },
      },
      create: {
        tenantId,
        orderNo,
        status: 'open',
        subtotal: 0,
        discount: 0,
        taxTotal: 0,
        total: 0,
        metadata: { tableKey: tableId, source: 'products:trace-pos-insertion', lastMutationId: mutationId },
      },
    });
    orderId = order.id;

    const created = await tx.orderItem.create({
      data: {
        tenantId,
        orderId: order.id,
        productId: item.productSnapshot.productId ?? null,
        name: item.productSnapshot.name,
        quantity: 1,
        unitPrice: item.productSnapshot.price,
        total: item.productSnapshot.price,
        metadata: {
          productId: item.productSnapshot.productId,
          productKey: item.posKey,
          posKey: item.posKey,
          catalogRevision: item.catalogRevision,
          productRevision: item.productSnapshot.revision,
          productSnapshot: item.productSnapshot,
          category: item.productSnapshot.category,
          printCategory: item.printCategory ?? item.productSnapshot.category,
          sentQty: 0,
          mutationId,
        },
      },
    });
    itemId = created.id;

    const nextItems = await tx.orderItem.findMany({ where: { tenantId, orderId: order.id }, select: { quantity: true, unitPrice: true, metadata: true } });
    const subtotal = nextItems.reduce((sum, row) => {
      const metadata = metadataObject(row.metadata);
      if (metadata.complimentary) return sum;
      const sign = metadata.isReturn ? -1 : 1;
      return sum + (Number(row.quantity) * Number(row.unitPrice) * sign);
    }, 0);
    const taxTotal = Number((subtotal - (subtotal / (1 + VAT_RATE))).toFixed(2));
    await tx.order.update({
      where: { id: order.id, tenantId },
      data: {
        subtotal,
        taxTotal,
        total: Number(subtotal.toFixed(2)),
        metadata: { ...metadataObject(order.metadata), tableKey: tableId, lastMutationId: mutationId },
      },
    });
  });

  const persisted = await prisma.orderItem.findFirst({
    where: { id: itemId, tenantId, orderId },
    select: { id: true, productId: true, name: true, quantity: true, unitPrice: true, total: true, metadata: true },
  });
  if (!persisted) throw new Error('Trace order item was not persisted.');
  const metadata = metadataObject(persisted.metadata);
  if (metadata.posKey !== item.posKey) throw new Error('Persisted item posKey mismatch.');
  if (metadata.catalogRevision !== catalog.catalogRevision) throw new Error('Persisted item catalogRevision mismatch.');

  const keepTraceOrder = process.env.KEEP_TRACE_ORDER === '1';
  if (!keepTraceOrder) {
    await prisma.orderItem.deleteMany({ where: { tenantId, orderId } });
    await prisma.order.deleteMany({ where: { tenantId, id: orderId, orderNo } });
  }

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    branchId,
    tableId,
    mutationId,
    catalogRevision: catalog.catalogRevision,
    checksum: catalog.checksum,
    product: {
      productId: item.productSnapshot.productId,
      posKey: item.posKey,
      name: item.productSnapshot.name,
      productType: item.productSnapshot.productType,
      revision: item.productSnapshot.revision,
      price: item.productSnapshot.price,
    },
    persistence: {
      orderId,
      itemId,
      kept: keepTraceOrder,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[trace-pos-insertion] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
