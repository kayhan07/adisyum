import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseJsonArray(snapshot, key) {
  const raw = snapshot[key];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const [, , filePath] = process.argv;
const tenantId = required(process.env.TENANT_ID, 'TENANT_ID');
const snapshotPath = required(filePath, 'snapshot json path');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));

await prisma.$transaction(async (tx) => {
  await tx.tenant.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      name: snapshot.company?.name || tenantId,
      packageType: 'premium',
      status: 'trial',
    },
  });

  const products = parseJsonArray(snapshot, 'adisyon-sale-products');
  for (const product of products) {
    if (!product?.name) continue;
    await tx.product.create({
      data: {
        tenantId,
        name: String(product.name),
        sku: product.id ? String(product.id) : null,
        price: Number(product.price || product.salePrice || 0),
        vatRate: Number(product.vatRate || product.vat_rate || 10),
        unitType: String(product.salesUnit || product.unitType || 'adet'),
        metadata: product,
      },
    });
  }

  const tables = parseJsonArray(snapshot, 'adisyon-table-layout-state');
  for (const table of tables) {
    if (!table?.name && !table?.label) continue;
    await tx.posTable.create({
      data: {
        tenantId,
        name: String(table.name || table.label),
        status: String(table.status || 'available'),
        seats: Number(table.seats || 0),
        position: table.position || {},
        metadata: table,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId,
      action: 'system_admin_action',
      entity: 'localstorage_import',
      metadata: { importedProducts: products.length, importedTables: tables.length },
    },
  });
});

await prisma.$disconnect();
console.log(`Imported localStorage snapshot for tenant ${tenantId}.`);

