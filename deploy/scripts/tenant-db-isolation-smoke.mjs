import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const suffix = Date.now();
const tenantA = `DB-SMOKE-A-${suffix}`;
const tenantB = `DB-SMOKE-B-${suffix}`;

async function createTenant(tx, tenantId) {
  await tx.tenant.create({
    data: {
      tenantId,
      name: tenantId,
      status: 'trial',
      packageType: 'premium',
    },
  });
  await tx.subscription.create({
    data: {
      tenantId,
      status: 'trial',
      packageType: 'premium',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000),
    },
  });
}

await prisma.$transaction(async (tx) => {
  await createTenant(tx, tenantA);
  await createTenant(tx, tenantB);

  await tx.product.create({
    data: {
      tenantId: tenantA,
      name: 'Tenant A Product',
      price: 10,
      vatRate: 10,
      unitType: 'adet',
    },
  });

  await tx.posTable.create({
    data: {
      tenantId: tenantA,
      name: 'Tenant A Table',
      status: 'available',
    },
  });

  const order = await tx.order.create({
    data: {
      tenantId: tenantA,
      orderNo: `A-${suffix}`,
      status: 'open',
      total: 10,
      subtotal: 10,
    },
  });

  await tx.orderItem.create({
    data: {
      tenantId: tenantA,
      orderId: order.id,
      name: 'Tenant A Product',
      quantity: 1,
      unitPrice: 10,
      total: 10,
    },
  });

  await tx.payment.create({
    data: {
      tenantId: tenantA,
      orderId: order.id,
      method: 'cash',
      status: 'paid',
      amount: 10,
    },
  });

  await tx.report.create({
    data: {
      tenantId: tenantA,
      type: 'daily-sales',
      params: { smoke: true },
      result: { total: 10 },
    },
  });

  await tx.runtimeState.create({
    data: {
      tenantId: tenantA,
      key: `realtime-smoke-${suffix}`,
      payload: { tableId: 'A-only' },
    },
  });

  await tx.syncQueue.create({
    data: {
      tenantId: tenantA,
      eventType: 'export_smoke',
      payload: { exportId: 'A-only' },
      status: 'pending',
    },
  });
});

const [productsVisibleToB, tablesVisibleToB, ordersVisibleToB, paymentsVisibleToB, reportsVisibleToB, realtimeVisibleToB, exportsVisibleToB] = await Promise.all([
  prisma.product.count({ where: { tenantId: tenantB, name: 'Tenant A Product' } }),
  prisma.posTable.count({ where: { tenantId: tenantB, name: 'Tenant A Table' } }),
  prisma.order.count({ where: { tenantId: tenantB, orderNo: `A-${suffix}` } }),
  prisma.payment.count({ where: { tenantId: tenantB, amount: 10 } }),
  prisma.report.count({ where: { tenantId: tenantB, type: 'daily-sales' } }),
  prisma.runtimeState.count({ where: { tenantId: tenantB, key: `realtime-smoke-${suffix}` } }),
  prisma.syncQueue.count({ where: { tenantId: tenantB, eventType: 'export_smoke' } }),
]);

if (productsVisibleToB || tablesVisibleToB || ordersVisibleToB || paymentsVisibleToB || reportsVisibleToB || realtimeVisibleToB || exportsVisibleToB) {
  throw new Error('Tenant B can see Tenant A data.');
}

await prisma.$transaction([
  prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.syncQueue.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.runtimeState.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.report.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.payment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.orderItem.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.order.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.product.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.posTable.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.subscription.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
  prisma.tenant.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
]);

await prisma.$disconnect();
console.log('DB tenant isolation smoke test passed.');
