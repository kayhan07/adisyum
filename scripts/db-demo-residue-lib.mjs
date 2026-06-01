import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export const LEGACY_DEMO_TENANT_ID = ['ABN', '48291'].join('-');
export const RESIDUE_MARKERS = [
  LEGACY_DEMO_TENANT_ID,
  'demo',
  'test',
  'seed',
  'sample',
  'mock',
  'fixture',
  'bistro',
  'aurelia',
  'default',
  'anonymous',
  'local',
  'localhost',
  'fake',
  'printer test',
  'kitchen demo',
  'receipt demo',
];

const ENV_FILES = ['.env', '.env.production', '.env.local'];
const TENANT_SCOPED_TABLES = [
  'branches',
  'subscriptions',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'user_permissions',
  'sessions',
  'presence_sessions',
  'device_heartbeats',
  'tenant_device_registry',
  'tenant_print_jobs',
  'table_groups',
  'tables',
  'product_categories',
  'products',
  'product_revisions',
  'media_assets',
  'product_variants',
  'orders',
  'order_items',
  'payments',
  'customers',
  'suppliers',
  'warehouses',
  'stock_items',
  'stock_movements',
  'cash_registers',
  'cash_transactions',
  'printers',
  'printer_groups',
  'recipes',
  'recipe_items',
  'template_pack_imports',
  'template_imports',
  'expenses',
  'shifts',
  'reports',
  'sync_queue',
  'offline_events',
  'runtime_states',
];
const MARKER_SCAN_TABLES = [
  'tenants',
  ...TENANT_SCOPED_TABLES,
  'operational_events',
  'audit_logs',
  'provisioning_jobs',
];
const CLEAN_START_TABLES = {
  productCount: 'products',
  categoryCount: 'product_categories',
  rawIngredientCount: 'stock_items',
  recipeCount: 'recipes',
  stockMovementCount: 'stock_movements',
  tableCount: 'tables',
  floorCount: 'table_groups',
  orderCount: 'orders',
  paymentCount: 'payments',
  currentAccountCount: 'customers',
  supplierCount: 'suppliers',
  cashRegisterCount: 'cash_registers',
  cashMovementCount: 'cash_transactions',
  reportCount: 'reports',
  printerMappingCount: 'printers',
  runtimeSnapshotCount: 'runtime_states',
};
const VOLATILE_RUNTIME_KEYS = new Set([
  'aurelia-table-payment-requested',
  'aurelia-table-live-totals',
  'aurelia-table-meta',
  'aurelia-table-state-sync-meta',
]);

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return null;
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const parsed = parseDotEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for DB demo residue audit.');
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? Number(item) : item));
}

async function query(prisma, sql, ...params) {
  return jsonValue(await prisma.$queryRawUnsafe(sql, ...params));
}

function textContainsMarker(value) {
  const normalized = (JSON.stringify(value) ?? String(value ?? '')).toLocaleLowerCase('en-US');
  return RESIDUE_MARKERS.some((marker) => normalized.includes(marker.toLocaleLowerCase('en-US')));
}

function collectEmbeddedTenantIds(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item) => collectEmbeddedTenantIds(item, found));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'tenantId' || key === 'tenant_id') && typeof item === 'string' && item.trim()) found.add(item.trim());
    collectEmbeddedTenantIds(item, found);
  }
  return found;
}

function classifyTenant(tenant) {
  const metadata = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const exactLegacyDemo = tenant.tenantId === LEGACY_DEMO_TENANT_ID;
  const explicitDemoMetadata = metadata.demoSeed === true || metadata.seed === true || metadata.fixture === true;
  return {
    exactLegacyDemo,
    explicitDemoMetadata,
    safeToSoftDelete: exactLegacyDemo || explicitDemoMetadata,
    markerReview: textContainsMarker(tenant),
  };
}

async function markerResidue(prisma, existingTables) {
  const findings = [];
  const patterns = RESIDUE_MARKERS.map((marker) => `%${marker.toLocaleLowerCase('en-US')}%`);
  for (const table of MARKER_SCAN_TABLES.filter((name) => existingTables.has(name))) {
    const rows = await query(
      prisma,
      `SELECT row_to_json(t) AS record FROM "${table}" t WHERE lower(row_to_json(t)::text) LIKE ANY($1::text[]) LIMIT 100`,
      patterns,
    );
    if (rows.length) findings.push({ table, countReturned: rows.length, cappedAt: 100, records: rows.map((row) => row.record) });
  }
  return findings;
}

async function orphanTenantRecords(prisma, existingTables) {
  const findings = [];
  for (const table of TENANT_SCOPED_TABLES.filter((name) => existingTables.has(name))) {
    const rows = await query(
      prisma,
      `SELECT t.* FROM "${table}" t LEFT JOIN tenants tenant ON tenant.tenant_id = t.tenant_id WHERE tenant.tenant_id IS NULL LIMIT 100`,
    );
    if (rows.length) findings.push({ table, countReturned: rows.length, cappedAt: 100, records: rows });
  }
  return findings;
}

async function cleanStartCounts(prisma, existingTables) {
  const tenants = await query(
    prisma,
    `SELECT tenant_id AS "tenantId", name, status, deleted_at AS "deletedAt", created_at AS "createdAt"
     FROM tenants WHERE tenant_id <> 'system' ORDER BY created_at DESC LIMIT 20`,
  );
  for (const tenant of tenants) {
    tenant.counts = {};
    for (const [key, table] of Object.entries(CLEAN_START_TABLES)) {
      if (!existingTables.has(table)) {
        tenant.counts[key] = null;
        continue;
      }
      const [row] = await query(prisma, `SELECT count(*)::int AS count FROM "${table}" WHERE tenant_id = $1`, tenant.tenantId);
      tenant.counts[key] = row?.count ?? 0;
    }
  }
  return tenants;
}

async function runtimeSnapshotAudit(prisma, existingTables) {
  if (!existingTables.has('runtime_states')) return { records: [], safePruneIds: [], summary: {} };
  const records = await query(
    prisma,
    `SELECT r.id, r.tenant_id AS "tenantId", r.key, r.payload, r.updated_at AS "updatedAt",
            pg_column_size(r.payload) AS "payloadBytes",
            tenant.status AS "tenantStatus", tenant.deleted_at AS "tenantDeletedAt"
     FROM runtime_states r LEFT JOIN tenants tenant ON tenant.tenant_id = r.tenant_id
     ORDER BY r.updated_at DESC
     LIMIT 5000`,
  );
  const safePruneIds = [];
  for (const record of records) {
    const embeddedTenantIds = [...collectEmbeddedTenantIds(record.payload)];
    record.embeddedTenantIds = embeddedTenantIds;
    record.tenantMismatch = embeddedTenantIds.some((tenantId) => tenantId !== record.tenantId);
    record.demoResidue = textContainsMarker(record.payload) || textContainsMarker(record.key);
    record.orphanTenant = !record.tenantStatus;
    record.expiredSnapshot = Date.now() - new Date(record.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
    record.volatileKey = VOLATILE_RUNTIME_KEYS.has(record.key);
    record.oversized = Number(record.payloadBytes) > 1_000_000;
    record.safeToPrune = record.orphanTenant
      || record.tenantMismatch
      || (record.demoResidue && (record.tenantDeletedAt || record.tenantId === LEGACY_DEMO_TENANT_ID))
      || (record.expiredSnapshot && record.volatileKey && record.tenantDeletedAt);
    if (record.safeToPrune) safePruneIds.push(record.id);
  }
  return {
    records,
    safePruneIds,
    summary: {
      cappedAt: 5000,
      total: records.length,
      expired: records.filter((record) => record.expiredSnapshot).length,
      tenantMismatch: records.filter((record) => record.tenantMismatch).length,
      demoResidue: records.filter((record) => record.demoResidue).length,
      oversized: records.filter((record) => record.oversized).length,
      safeToPrune: safePruneIds.length,
    },
  };
}

async function printerAudit(prisma, existingTables) {
  const printers = existingTables.has('printers')
    ? await query(
        prisma,
        `SELECT p.*, tenant.status AS "tenantStatus", tenant.deleted_at AS "tenantDeletedAt"
         FROM printers p LEFT JOIN tenants tenant ON tenant.tenant_id = p.tenant_id`,
      )
    : [];
  const registries = existingTables.has('tenant_device_registry')
    ? await query(
        prisma,
        `SELECT r.*, tenant.status AS "tenantStatus", tenant.deleted_at AS "tenantDeletedAt"
         FROM tenant_device_registry r LEFT JOIN tenants tenant ON tenant.tenant_id = r.tenant_id`,
      )
    : [];
  const duplicates = existingTables.has('printers')
    ? await query(
        prisma,
        `SELECT tenant_id AS "tenantId", lower(name) AS "normalizedPrinterName", count(*)::int AS count,
                array_agg(id::text) AS ids
         FROM printers GROUP BY tenant_id, lower(name) HAVING count(*) > 1`,
      )
    : [];
  const now = Date.now();
  for (const printer of printers) {
    printer.demoResidue = textContainsMarker(printer);
    printer.orphanTenant = !printer.tenantStatus;
    printer.safeToDeactivate = printer.orphanTenant && printer.demoResidue;
  }
  for (const registry of registries) {
    registry.demoResidue = textContainsMarker(registry);
    registry.orphanTenant = !registry.tenantStatus;
    registry.staleHeartbeat = now - new Date(registry.lastHeartbeatAt).getTime() > 30 * 24 * 60 * 60 * 1000;
    registry.safeToRevoke = registry.orphanTenant && (registry.demoResidue || registry.staleHeartbeat);
  }
  return { printers, registries, duplicates };
}

async function integrityAudit(prisma, existingTables) {
  const checks = [];
  const add = async (name, sql) => {
    const records = await query(prisma, sql);
    checks.push({ name, count: records.length, records });
  };
  if (existingTables.has('order_items') && existingTables.has('orders')) {
    await add('order_items_without_order', `SELECT item.* FROM order_items item LEFT JOIN orders parent ON parent.id = item.order_id AND parent.tenant_id = item.tenant_id WHERE parent.id IS NULL LIMIT 100`);
  }
  if (existingTables.has('order_items') && existingTables.has('products')) {
    await add('order_items_without_product', `SELECT item.* FROM order_items item LEFT JOIN products product ON product.id = item.product_id AND product.tenant_id = item.tenant_id WHERE item.product_id IS NOT NULL AND product.id IS NULL LIMIT 100`);
    await add('active_order_items_with_deleted_product', `SELECT item.* FROM order_items item JOIN products product ON product.id = item.product_id AND product.tenant_id = item.tenant_id WHERE product.deleted_at IS NOT NULL LIMIT 100`);
  }
  if (existingTables.has('orders') && existingTables.has('tables')) {
    await add('orders_without_table', `SELECT parent.* FROM orders parent LEFT JOIN tables table_row ON table_row.id = parent.table_id AND table_row.tenant_id = parent.tenant_id WHERE parent.table_id IS NOT NULL AND table_row.id IS NULL LIMIT 100`);
  }
  if (existingTables.has('tables') && existingTables.has('table_groups')) {
    await add('tables_without_floor_group', `SELECT table_row.* FROM tables table_row LEFT JOIN table_groups floor_group ON floor_group.id = table_row.group_id AND floor_group.tenant_id = table_row.tenant_id WHERE table_row.group_id IS NOT NULL AND floor_group.id IS NULL LIMIT 100`);
  }
  if (existingTables.has('sessions') && existingTables.has('users')) {
    await add('sessions_without_user', `SELECT session_row.* FROM sessions session_row LEFT JOIN users app_user ON app_user.id = session_row.user_id AND app_user.tenant_id = session_row.tenant_id WHERE app_user.id IS NULL LIMIT 100`);
  }
  await add('active_tenants_without_active_subscription', `SELECT tenant.* FROM tenants tenant LEFT JOIN subscriptions subscription ON subscription.tenant_id = tenant.tenant_id AND subscription.deleted_at IS NULL AND subscription.status IN ('active', 'trial', 'demo') AND subscription.ends_at >= now() WHERE tenant.deleted_at IS NULL AND tenant.status IN ('active', 'trial', 'demo') AND subscription.id IS NULL LIMIT 100`);
  return checks;
}

export async function auditDatabase() {
  loadEnvFiles();
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe("SET statement_timeout = '15000ms'");
    const tableRows = await query(
      prisma,
      `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema = current_schema()`,
    );
    const existingTables = new Set(tableRows.map((row) => row.tableName));
    const tenants = await query(
      prisma,
      `SELECT tenant_id AS "tenantId", name, legal_name AS "legalName", status, metadata, deleted_at AS "deletedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM tenants ORDER BY created_at DESC`,
    );
    const classifiedTenants = tenants.map((tenant) => ({ ...tenant, classification: classifyTenant(tenant) }));
    const [markerFindings, orphanFindings, recentTenantCounts, runtimeSnapshots, printers, integrity] = await Promise.all([
      markerResidue(prisma, existingTables),
      orphanTenantRecords(prisma, existingTables),
      cleanStartCounts(prisma, existingTables),
      runtimeSnapshotAudit(prisma, existingTables),
      printerAudit(prisma, existingTables),
      integrityAudit(prisma, existingTables),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_AUDIT',
      markers: RESIDUE_MARKERS,
      scannedTables: [...existingTables].sort(),
      tenants: classifiedTenants,
      markerFindings,
      orphanFindings,
      recentTenantCounts,
      runtimeSnapshots,
      printers,
      integrity,
      cleanupPlan: {
        safeRuntimeStatePruneIds: runtimeSnapshots.safePruneIds,
        safeTenantSoftDeleteIds: classifiedTenants.filter((tenant) => tenant.classification.safeToSoftDelete && !tenant.deletedAt).map((tenant) => tenant.tenantId),
        safePrinterDeactivateIds: printers.printers.filter((printer) => printer.safeToDeactivate).map((printer) => printer.id),
        safeDeviceRegistryRevokeIds: printers.registries.filter((registry) => registry.safeToRevoke).map((registry) => registry.id),
        manualReview: markerFindings.map((finding) => ({ table: finding.table, countReturned: finding.countReturned })),
        doNotTouch: ['orders', 'order_items', 'payments', 'cash_transactions', 'customers', 'suppliers', 'reports'],
      },
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function writeJsonReport(report, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
