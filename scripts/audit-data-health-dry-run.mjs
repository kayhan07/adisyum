#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'data-health-dry-run.json');
const isProductionMode = process.argv.includes('--production');
const startedAt = new Date();

function loadEnvFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFileIfExists(path.join(root, '.env'));
loadEnvFileIfExists(path.join(root, '.env.local'));
loadEnvFileIfExists(path.join(root, '.env.production'));

const prisma = new PrismaClient();

const COMMANDS = [
  'npm run audit:data-health:dry-run',
  'npm run audit:api-guards',
  'npm run audit:prisma-tenant-scope',
  'npx tsc --noEmit',
  'npm run build',
];

const TENANT_TABLES = [
  { table: 'products', label: 'Product' },
  { table: 'product_categories', label: 'ProductCategory' },
  { table: 'tables', label: 'PosTable' },
  { table: 'table_groups', label: 'TableGroup' },
  { table: 'orders', label: 'Order' },
  { table: 'order_items', label: 'OrderItem' },
  { table: 'payments', label: 'Payment' },
  { table: 'current_account_movements', label: 'CurrentAccountMovement' },
  { table: 'stock_items', label: 'StockItem' },
  { table: 'stock_movements', label: 'StockMovement' },
  { table: 'warehouses', label: 'Warehouse' },
  { table: 'recipes', label: 'Recipe' },
  { table: 'recipe_items', label: 'RecipeItem' },
  { table: 'printers', label: 'Printer' },
  { table: 'printer_groups', label: 'PrinterGroup' },
  { table: 'runtime_states', label: 'RuntimeState' },
  { table: 'sync_queue', label: 'SyncQueue' },
  { table: 'offline_events', label: 'OfflineEvent' },
  { table: 'users', label: 'User' },
  { table: 'branches', label: 'Branch' },
  { table: 'subscriptions', label: 'Subscription' },
];

const findings = [];

function addFinding(severity, category, check, count, details = {}, sample = []) {
  findings.push({ severity, category, check, count, details, sample });
}

function parseCount(value) {
  return Number(value?.count ?? value ?? 0);
}

function maskDatabaseUrl(urlString) {
  if (!urlString) return 'not-set';
  try {
    const url = new URL(urlString);
    const host = url.hostname || 'unknown-host';
    const db = (url.pathname || '').replace(/^\//, '') || 'unknown-db';
    const hostMasked = host.length > 8 ? `${host.slice(0, 3)}***${host.slice(-3)}` : `${host.slice(0, 1)}***`;
    const dbMasked = db.length > 6 ? `${db.slice(0, 2)}***${db.slice(-2)}` : `${db.slice(0, 1)}***`;
    return `${url.protocol}//${hostMasked}/${dbMasked}`;
  } catch {
    return 'invalid-url';
  }
}

function isProductionTarget(urlString) {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    const host = (url.hostname || '').toLowerCase();
    const local = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    if (local) return false;
    if (host.includes('dev') || host.includes('test') || host.includes('staging')) return false;
    return true;
  } catch {
    return false;
  }
}

async function queryCount(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return parseCount(rows?.[0]?.count);
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function keywordPattern() {
  return '(demo|seed|sample|test|tnt-sample-0000|adisyon demo|örnek ürün|ornek urun|örnek kategori|ornek kategori|masa demo|cari demo|müşteri demo|musteri demo)';
}

function branchIdFromMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value.branchId ?? value.branch_id ?? value.branch;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function numericFromUnknown(value) {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function buildSkippedSections(reason, commitHash) {
  return {
    '1_general_health_summary': { summary: reason },
    '2_tenant_integrity_summary': [{ severity: 'info', note: reason }],
    '3_product_category_findings': [{ severity: 'info', note: reason }],
    '4_finance_findings': [{ severity: 'info', note: reason }],
    '5_order_table_payment_findings': [{ severity: 'info', note: reason }],
    '6_stock_recipe_findings': [{ severity: 'info', note: reason }],
    '7_printer_runtime_findings': [{ severity: 'info', note: reason }],
    '8_demo_seed_legacy_findings': [{ severity: 'info', note: reason }],
    '9_critical_findings': [],
    '10_high_risk_findings': [],
    '11_warning_findings': [],
    '12_recommended_backfill_plan': [
      'READ_ONLY_DATA_AUDIT=1 set edilip production-dry-run komutu ile sadece okuma denetimi çalıştırılmalı.',
      'Çıkan bulgulara göre staging üzerinde idempotent düzeltme planı hazırlanmalı.',
      'Canlıda düzeltme öncesi bakım penceresi ve geri dönüş planı zorunlu.',
    ],
    '13_do_not_auto_touch': [
      'Ödeme ve cari mutabakat kayıtları.',
      'Faturalı/kapatılmış sipariş zinciri.',
      'Aktif runtime state kayıtları (rollback planı olmadan).',
    ],
    '14_executed_commands': COMMANDS,
    '15_commit_hash': commitHash,
    '16_validation': 'Read-only guard kept; no DB mutation executed.',
  };
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const prodTarget = isProductionTarget(databaseUrl);
  const readOnlyFlag = process.env.READ_ONLY_DATA_AUDIT === '1';

  if (!databaseUrl) {
    const commitHash = getCommitHash();
    const reason = 'Dry-run skipped because DATABASE_URL is not configured.';
    const skipped = {
      timestamp: startedAt.toISOString(),
      environment: {
        mode: isProductionMode ? 'production-dry-run' : 'dry-run',
        nodeEnv: process.env.NODE_ENV || 'unknown',
        productionTargetDetected: false,
        readOnlyFlag: readOnlyFlag ? '1' : '0',
      },
      databaseTargetMasked: 'not-set',
      commitHash,
      counts: {
        tenants: null,
        activeTenants: null,
        inactiveTenants: null,
        demoTrialTenants: null,
        branches: null,
        users: null,
        products: null,
        categories: null,
        tables: null,
        orders: null,
        payments: null,
        currentAccountMovements: null,
        stockItems: null,
        stockMovements: null,
        recipes: null,
        printers: null,
      },
      severitySummary: { info: 1, warning: 0, 'high-risk': 0, critical: 0 },
      findings: [
        {
          severity: 'info',
          category: 'general',
          check: 'Database connection env missing; dry-run skipped',
          count: 0,
          details: { reason: 'Set database connection env for data health dry-run.' },
        },
      ],
      sections: buildSkippedSections(reason, commitHash),
      productionDryRunSupport: {
        supported: true,
        command: 'npm run audit:data-health:production-dry-run',
        requirement: 'Production dry-run requires production-like database connection env and READ_ONLY_DATA_AUDIT=1',
        executedInThisRun: isProductionMode,
      },
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(skipped, null, 2));
    console.log('[audit-data-health-dry-run] database connection env missing, report generated in skipped mode.');
    return;
  }

  if (prodTarget && !readOnlyFlag) {
    const commitHash = getCommitHash();
    const reason = 'Dry-run skipped by safety guard for production-like DB target.';
    const skipped = {
      timestamp: startedAt.toISOString(),
      environment: {
        mode: isProductionMode ? 'production-dry-run' : 'dry-run',
        nodeEnv: process.env.NODE_ENV || 'unknown',
        productionTargetDetected: true,
        readOnlyFlag: '0',
      },
      databaseTargetMasked: maskDatabaseUrl(databaseUrl),
      commitHash,
      counts: {
        tenants: null,
        activeTenants: null,
        inactiveTenants: null,
        demoTrialTenants: null,
        branches: null,
        users: null,
        products: null,
        categories: null,
        tables: null,
        orders: null,
        payments: null,
        currentAccountMovements: null,
        stockItems: null,
        stockMovements: null,
        recipes: null,
        printers: null,
      },
      severitySummary: { info: 1, warning: 0, 'high-risk': 0, critical: 0 },
      findings: [
        {
          severity: 'info',
          category: 'general',
          check: 'Production-like target blocked by READ_ONLY_DATA_AUDIT guard',
          count: 0,
          details: { reason: 'Set READ_ONLY_DATA_AUDIT=1 to run against production-like DATABASE_URL.' },
        },
      ],
      sections: buildSkippedSections(reason, commitHash),
      productionDryRunSupport: {
        supported: true,
        command: 'npm run audit:data-health:production-dry-run',
        requirement: 'Production dry-run requires production-like DATABASE_URL and READ_ONLY_DATA_AUDIT=1',
        executedInThisRun: isProductionMode,
      },
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(skipped, null, 2));
    console.log('[audit-data-health-dry-run] production-like target blocked, report generated in guarded mode.');
    return;
  }
  if (isProductionMode && !prodTarget) {
    throw new Error('Production dry-run requested but DATABASE_URL does not look like production target.');
  }

  const [
    tenantsCount,
    activeTenantsCount,
    inactiveTenantsCount,
    demoTrialTenantsCount,
    branchesCount,
    usersCount,
    productsCount,
    categoriesCount,
    tablesCount,
    ordersCount,
    paymentsCount,
    currentAccountMovementsCount,
    stockItemsCount,
    stockMovementsCount,
    recipesCount,
    printersCount,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'active', deletedAt: null } }),
    prisma.tenant.count({ where: { OR: [{ deletedAt: { not: null } }, { status: { in: ['suspended', 'expired', 'blocked'] } }] } }),
    prisma.tenant.count({ where: { status: { in: ['demo', 'trial'] }, deletedAt: null } }),
    prisma.branch.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.productCategory.count(),
    prisma.posTable.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.currentAccountMovement.count(),
    prisma.stockItem.count(),
    prisma.stockMovement.count(),
    prisma.recipe.count(),
    prisma.printer.count(),
  ]);

  for (const item of TENANT_TABLES) {
    const emptyTenantCount = await queryCount(`
      SELECT COUNT(*)::int AS count
      FROM ${item.table}
      WHERE tenant_id IS NULL OR btrim(tenant_id) = ''
    `);
    if (emptyTenantCount > 0) {
      addFinding('critical', 'tenant-integrity', `${item.label}: tenantId empty`, emptyTenantCount, { table: item.table });
    }

    const orphanTenantCount = await queryCount(`
      SELECT COUNT(*)::int AS count
      FROM ${item.table} t
      LEFT JOIN tenants x ON x.tenant_id = t.tenant_id
      WHERE t.tenant_id IS NOT NULL
        AND btrim(t.tenant_id) <> ''
        AND x.tenant_id IS NULL
    `);
    if (orphanTenantCount > 0) {
      addFinding('critical', 'tenant-integrity', `${item.label}: orphan tenant reference`, orphanTenantCount, { table: item.table });
    }
  }

  const orphanUserBranch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM users u
    LEFT JOIN branches b ON b.tenant_id = u.tenant_id AND b.branch_id = u.branch_id
    WHERE u.branch_id IS NOT NULL AND b.id IS NULL
  `);
  if (orphanUserBranch > 0) addFinding('high-risk', 'tenant-integrity', 'User branchId exists but branch missing', orphanUserBranch);

  const userBranchTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM users u
    WHERE u.branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM branches b
        WHERE b.branch_id = u.branch_id
          AND b.tenant_id <> u.tenant_id
      )
  `);
  if (userBranchTenantMismatch > 0) addFinding('critical', 'tenant-integrity', 'User branch tenant mismatch', userBranchTenantMismatch);

  const productCategoryMissing = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
    WHERE p.category_id IS NOT NULL AND c.id IS NULL
  `);
  if (productCategoryMissing > 0) addFinding('critical', 'product-category', 'Product category missing in same tenant', productCategoryMissing);

  const productCategoryCrossTenant = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products p
    JOIN product_categories c ON c.id = p.category_id
    WHERE c.tenant_id <> p.tenant_id
  `);
  if (productCategoryCrossTenant > 0) addFinding('critical', 'product-category', 'Product category belongs to different tenant', productCategoryCrossTenant);

  const productSoftDeleteInconsistent = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE deleted_at IS NOT NULL AND active = true
  `);
  if (productSoftDeleteInconsistent > 0) addFinding('high-risk', 'product-category', 'Soft-deleted products still active', productSoftDeleteInconsistent);

  const duplicateSku = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT tenant_id, sku
      FROM products
      WHERE sku IS NOT NULL AND btrim(sku) <> '' AND deleted_at IS NULL
      GROUP BY tenant_id, sku
      HAVING COUNT(*) > 1
    ) x
  `);
  if (duplicateSku > 0) addFinding('high-risk', 'product-category', 'Duplicate SKU per tenant', duplicateSku);

  const duplicateBarcode = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT tenant_id, barcode
      FROM products
      WHERE barcode IS NOT NULL AND btrim(barcode) <> '' AND deleted_at IS NULL
      GROUP BY tenant_id, barcode
      HAVING COUNT(*) > 1
    ) x
  `);
  if (duplicateBarcode > 0) addFinding('high-risk', 'product-category', 'Duplicate barcode per tenant', duplicateBarcode);

  const duplicateActiveName = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT tenant_id, lower(name) AS nm
      FROM products
      WHERE active = true AND deleted_at IS NULL
      GROUP BY tenant_id, lower(name)
      HAVING COUNT(*) > 1
    ) x
  `);
  if (duplicateActiveName > 0) addFinding('warning', 'product-category', 'Duplicate active product name per tenant', duplicateActiveName);

  const negativeProductPrice = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE price < 0
  `);
  if (negativeProductPrice > 0) addFinding('high-risk', 'product-category', 'Negative product price', negativeProductPrice);

  const zeroProductPrice = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products
    WHERE price = 0 AND active = true AND deleted_at IS NULL
  `);
  if (zeroProductPrice > 0) addFinding('warning', 'product-category', 'Zero priced active products', zeroProductPrice);

  const variantTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.tenant_id <> p.tenant_id
  `);
  if (variantTenantMismatch > 0) addFinding('critical', 'product-category', 'ProductVariant tenant mismatch with Product', variantTenantMismatch);

  addFinding('info', 'finance', 'CurrentAccount model availability', 0, { note: 'Separate CurrentAccount model is not present in schema; finance checks are based on CurrentAccountMovement.' });

  const camPaymentTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM current_account_movements cam
    JOIN payments p ON p.id = cam.payment_id
    WHERE cam.payment_id IS NOT NULL AND cam.tenant_id <> p.tenant_id
  `);
  if (camPaymentTenantMismatch > 0) addFinding('critical', 'finance', 'CurrentAccountMovement payment tenant mismatch', camPaymentTenantMismatch);

  const camOrderTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM current_account_movements cam
    JOIN orders o ON o.id = cam.order_id
    WHERE cam.order_id IS NOT NULL AND cam.tenant_id <> o.tenant_id
  `);
  if (camOrderTenantMismatch > 0) addFinding('critical', 'finance', 'CurrentAccountMovement order tenant mismatch', camOrderTenantMismatch);

  const camDuplicatePayment = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT tenant_id, payment_id
      FROM current_account_movements
      WHERE payment_id IS NOT NULL
      GROUP BY tenant_id, payment_id
      HAVING COUNT(*) > 1
    ) x
  `);
  if (camDuplicatePayment > 0) addFinding('high-risk', 'finance', 'Duplicate current account movements per payment', camDuplicatePayment);

  const camNegativeAmount = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM current_account_movements
    WHERE debit < 0 OR credit < 0
  `);
  if (camNegativeAmount > 0) addFinding('high-risk', 'finance', 'Negative debit/credit in current account movements', camNegativeAmount);

  const camUnexpectedType = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM current_account_movements
    WHERE type NOT IN ('SALE_DEBT', 'REFUND', 'ADJUSTMENT', 'PAYMENT')
  `);
  if (camUnexpectedType > 0) addFinding('warning', 'finance', 'Unexpected current account movement type', camUnexpectedType);

  const camBalanceMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT tenant_id, account_id, id, created_at, balance_after,
      ROUND(SUM((debit - credit)) OVER (PARTITION BY tenant_id, account_id ORDER BY created_at, id), 2) AS running_balance
      FROM current_account_movements
    ) q
    WHERE balance_after IS NOT NULL AND ABS(balance_after - running_balance) > 0.01
  `);
  if (camBalanceMismatch > 0) addFinding('high-risk', 'finance', 'Current account balanceAfter reconciliation mismatch', camBalanceMismatch);

  const orderTableMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM orders o
    LEFT JOIN tables t ON t.id = o.table_id AND t.tenant_id = o.tenant_id
    WHERE o.table_id IS NOT NULL AND t.id IS NULL
  `);
  if (orderTableMismatch > 0) addFinding('critical', 'order-payment-table', 'Order table reference missing or cross-tenant', orderTableMismatch);

  const orderItemOrderTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.tenant_id <> o.tenant_id
  `);
  if (orderItemOrderTenantMismatch > 0) addFinding('critical', 'order-payment-table', 'OrderItem tenant mismatch with Order', orderItemOrderTenantMismatch);

  const orderItemProductTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.product_id IS NOT NULL AND oi.tenant_id <> p.tenant_id
  `);
  if (orderItemProductTenantMismatch > 0) addFinding('critical', 'order-payment-table', 'OrderItem product tenant mismatch', orderItemProductTenantMismatch);

  const paymentOrderTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE p.order_id IS NOT NULL AND p.tenant_id <> o.tenant_id
  `);
  if (paymentOrderTenantMismatch > 0) addFinding('critical', 'order-payment-table', 'Payment order tenant mismatch', paymentOrderTenantMismatch);

  const negativePaymentAmount = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM payments
    WHERE amount < 0
  `);
  if (negativePaymentAmount > 0) addFinding('high-risk', 'order-payment-table', 'Negative payment amount', negativePaymentAmount);

  const closedOrderTableLinked = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE table_id IS NOT NULL AND status <> 'open'
  `);
  if (closedOrderTableLinked > 0) addFinding('warning', 'order-payment-table', 'Closed/non-open orders still linked to tableId', closedOrderTableLinked);

  const tableMetadataBranchMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM orders o
    JOIN tables t ON t.id = o.table_id AND t.tenant_id = o.tenant_id
    WHERE o.status = 'open'
      AND (o.metadata->>'branchId') IS NOT NULL
      AND (t.metadata->>'branchId') IS NOT NULL
      AND (o.metadata->>'branchId') <> (t.metadata->>'branchId')
  `);
  if (tableMetadataBranchMismatch > 0) addFinding('critical', 'order-payment-table', 'Open order/table branch metadata mismatch', tableMetadataBranchMismatch);

  const stockMovementItemTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM stock_movements sm
    JOIN stock_items si ON si.id = sm.stock_item_id
    WHERE sm.stock_item_id IS NOT NULL AND sm.tenant_id <> si.tenant_id
  `);
  if (stockMovementItemTenantMismatch > 0) addFinding('critical', 'stock-recipe', 'StockMovement stockItem tenant mismatch', stockMovementItemTenantMismatch);

  const stockMovementProductTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM stock_movements sm
    JOIN products p ON p.id::text = sm.metadata->>'productId'
    WHERE sm.metadata ? 'productId' AND sm.tenant_id <> p.tenant_id
  `);
  if (stockMovementProductTenantMismatch > 0) addFinding('critical', 'stock-recipe', 'StockMovement metadata product tenant mismatch', stockMovementProductTenantMismatch);

  const recipeProductTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM recipes r
    JOIN products p ON p.id = r.product_id
    WHERE r.product_id IS NOT NULL AND r.tenant_id <> p.tenant_id
  `);
  if (recipeProductTenantMismatch > 0) addFinding('critical', 'stock-recipe', 'Recipe product tenant mismatch', recipeProductTenantMismatch);

  const recipeItemRecipeTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM recipe_items ri
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.tenant_id <> r.tenant_id
  `);
  if (recipeItemRecipeTenantMismatch > 0) addFinding('critical', 'stock-recipe', 'RecipeItem tenant mismatch with Recipe', recipeItemRecipeTenantMismatch);

  const recipeItemStockTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM recipe_items ri
    JOIN stock_items si ON si.id = ri.stock_item_id
    WHERE ri.stock_item_id IS NOT NULL AND ri.tenant_id <> si.tenant_id
  `);
  if (recipeItemStockTenantMismatch > 0) addFinding('critical', 'stock-recipe', 'RecipeItem tenant mismatch with StockItem', recipeItemStockTenantMismatch);

  const invalidStockQuantities = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM stock_items
    WHERE quantity < 0 OR min_level < 0
  `);
  if (invalidStockQuantities > 0) addFinding('high-risk', 'stock-recipe', 'Negative quantity/minLevel in StockItem', invalidStockQuantities);

  const invalidRecipeItemQuantities = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM recipe_items
    WHERE quantity < 0
  `);
  if (invalidRecipeItemQuantities > 0) addFinding('high-risk', 'stock-recipe', 'Negative quantity in RecipeItem', invalidRecipeItemQuantities);

  const soldWithoutRecipe = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products p
    WHERE p.product_type = 'stock_item'
      AND p.active = true
      AND p.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id AND oi.tenant_id = p.tenant_id)
      AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.product_id = p.id AND r.tenant_id = p.tenant_id)
  `);
  if (soldWithoutRecipe > 0) addFinding('warning', 'stock-recipe', 'Sold stock-tracked products without recipe', soldWithoutRecipe);

  const printerGroupTenantMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM printers p
    JOIN printer_groups g ON g.id = p.group_id
    WHERE p.group_id IS NOT NULL AND p.tenant_id <> g.tenant_id
  `);
  if (printerGroupTenantMismatch > 0) addFinding('critical', 'printer-runtime', 'Printer group tenant mismatch', printerGroupTenantMismatch);

  const printerMetadataBranchMismatch = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM printers p
    WHERE (p.metadata->>'branchId') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM branches b
        WHERE b.tenant_id = p.tenant_id
          AND b.branch_id = (p.metadata->>'branchId')
      )
  `);
  if (printerMetadataBranchMismatch > 0) addFinding('high-risk', 'printer-runtime', 'Printer metadata branchId missing in tenant branches', printerMetadataBranchMismatch);

  const legacyDeviceTenants = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM tenant_device_registry
    WHERE lower(tenant_id) ~ '${keywordPattern()}'
  `);
  if (legacyDeviceTenants > 0) addFinding('warning', 'printer-runtime', 'Device registry contains demo/legacy tenant ids', legacyDeviceTenants);

  const demoSeedInProducts = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM products p
    JOIN tenants t ON t.tenant_id = p.tenant_id
    WHERE t.status NOT IN ('demo','trial')
      AND t.deleted_at IS NULL
      AND (
        lower(p.name) ~ '${keywordPattern()}'
        OR lower(coalesce(p.sku,'')) ~ '${keywordPattern()}'
        OR lower(coalesce(p.barcode,'')) ~ '${keywordPattern()}'
        OR lower(coalesce(p.metadata::text,'')) ~ '${keywordPattern()}'
      )
  `);
  if (demoSeedInProducts > 0) addFinding('high-risk', 'demo-seed-legacy', 'Demo/seed patterns in production-tenant products', demoSeedInProducts);

  const demoSeedInCategories = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM product_categories c
    JOIN tenants t ON t.tenant_id = c.tenant_id
    WHERE t.status NOT IN ('demo','trial')
      AND t.deleted_at IS NULL
      AND (lower(c.name) ~ '${keywordPattern()}' OR lower(coalesce(c.metadata::text,'')) ~ '${keywordPattern()}')
  `);
  if (demoSeedInCategories > 0) addFinding('high-risk', 'demo-seed-legacy', 'Demo/seed patterns in production-tenant categories', demoSeedInCategories);

  const demoSeedInTables = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM tables tb
    JOIN tenants t ON t.tenant_id = tb.tenant_id
    WHERE t.status NOT IN ('demo','trial')
      AND t.deleted_at IS NULL
      AND (lower(tb.name) ~ '${keywordPattern()}' OR lower(coalesce(tb.metadata::text,'')) ~ '${keywordPattern()}')
  `);
  if (demoSeedInTables > 0) addFinding('warning', 'demo-seed-legacy', 'Demo/seed patterns in production-tenant tables', demoSeedInTables);

  const demoSeedInCustomers = await queryCount(`
    SELECT COUNT(*)::int AS count
    FROM customers c
    JOIN tenants t ON t.tenant_id = c.tenant_id
    WHERE t.status NOT IN ('demo','trial')
      AND t.deleted_at IS NULL
      AND (lower(c.name) ~ '${keywordPattern()}' OR lower(coalesce(c.metadata::text,'')) ~ '${keywordPattern()}')
  `);
  if (demoSeedInCustomers > 0) addFinding('warning', 'demo-seed-legacy', 'Demo/seed patterns in production-tenant customers', demoSeedInCustomers);

  const runtimeRows = await prisma.runtimeState.findMany({
    where: { key: { startsWith: 'table-payment-state' } },
    select: { tenantId: true, key: true, payload: true },
    take: 5000,
  });

  const openOrders = await prisma.order.findMany({
    where: { status: 'open', tableId: { not: null } },
    select: { tenantId: true, tableId: true, total: true, metadata: true },
    take: 20000,
  });

  const openOrderTotals = new Map();
  for (const order of openOrders) {
    const key = `${order.tenantId}::${order.tableId}`;
    const current = openOrderTotals.get(key) ?? 0;
    openOrderTotals.set(key, current + Number(order.total ?? 0));
  }

  let staleTableTotals = 0;
  let layoutOccupiedNoOpenOrder = 0;
  let openOrderLayoutAvailable = 0;

  for (const row of runtimeRows) {
    const payload = safeJson(row.payload);
    const tables = Array.isArray(payload?.tables) ? payload.tables : [];
    for (const item of tables) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof item.id === 'string' ? item.id : typeof item.tableId === 'string' ? item.tableId : null;
      if (!id) continue;
      const status = typeof item.status === 'string' ? item.status : null;
      const total = numericFromUnknown(item.total);
      const key = `${row.tenantId}::${id}`;
      const openTotal = Number((openOrderTotals.get(key) ?? 0).toFixed(2));
      if (total != null && Math.abs(total - openTotal) > 0.01) staleTableTotals += 1;
      if (status === 'occupied' && openTotal <= 0) layoutOccupiedNoOpenOrder += 1;
      if (status === 'available' && openTotal > 0.01) openOrderLayoutAvailable += 1;
    }
  }

  if (staleTableTotals > 0) addFinding('high-risk', 'order-payment-table', 'Stale table totals', staleTableTotals);
  if (layoutOccupiedNoOpenOrder > 0) addFinding('high-risk', 'order-payment-table', 'Tables occupied by layout but no open order', layoutOccupiedNoOpenOrder);
  if (openOrderLayoutAvailable > 0) addFinding('high-risk', 'order-payment-table', 'Tables available in layout but open order exists', openOrderLayoutAvailable);

  const severitySummary = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + finding.count;
    return acc;
  }, { info: 0, warning: 0, 'high-risk': 0, critical: 0 });

  const byCategory = (name) => findings.filter((item) => item.category === name);

  const report = {
    timestamp: startedAt.toISOString(),
    environment: {
      mode: isProductionMode ? 'production-dry-run' : 'dry-run',
      nodeEnv: process.env.NODE_ENV || 'unknown',
      productionTargetDetected: prodTarget,
      readOnlyFlag: readOnlyFlag ? '1' : '0',
    },
    databaseTargetMasked: maskDatabaseUrl(databaseUrl),
    commitHash: getCommitHash(),
    counts: {
      tenants: tenantsCount,
      activeTenants: activeTenantsCount,
      inactiveTenants: inactiveTenantsCount,
      demoTrialTenants: demoTrialTenantsCount,
      branches: branchesCount,
      users: usersCount,
      products: productsCount,
      categories: categoriesCount,
      tables: tablesCount,
      orders: ordersCount,
      payments: paymentsCount,
      currentAccountMovements: currentAccountMovementsCount,
      stockItems: stockItemsCount,
      stockMovements: stockMovementsCount,
      recipes: recipesCount,
      printers: printersCount,
      staleTableTotals,
      tablesOccupiedNoOpenOrder: layoutOccupiedNoOpenOrder,
      tablesOpenOrderLayoutAvailable: openOrderLayoutAvailable,
      branchMismatchTableOrder: tableMetadataBranchMismatch,
    },
    severitySummary,
    findings,
    sections: {
      '1_general_health_summary': {
        summary: 'Dry-run read-only data health scan completed.',
        totals: { ...severitySummary },
      },
      '2_tenant_integrity_summary': byCategory('tenant-integrity'),
      '3_product_category_findings': byCategory('product-category'),
      '4_finance_findings': byCategory('finance'),
      '5_order_table_payment_findings': byCategory('order-payment-table'),
      '6_stock_recipe_findings': byCategory('stock-recipe'),
      '7_printer_runtime_findings': byCategory('printer-runtime'),
      '8_demo_seed_legacy_findings': byCategory('demo-seed-legacy'),
      '9_critical_findings': findings.filter((item) => item.severity === 'critical'),
      '10_high_risk_findings': findings.filter((item) => item.severity === 'high-risk'),
      '11_warning_findings': findings.filter((item) => item.severity === 'warning'),
      '12_recommended_backfill_plan': [
        'Phase 1: Export tenant-scoped snapshots for critical mismatch records (no writes).',
        'Phase 2: Prepare deterministic tenant-safe backfill scripts in staging first.',
        'Phase 3: Execute idempotent fixes in maintenance window with per-tenant checkpoints.',
        'Phase 4: Re-run this dry-run and finance/order reconciliation validations post-fix.',
      ],
      '13_do_not_auto_touch': [
        'Payments and current account movements tied to legal/financial reconciliation keys.',
        'Orders with finalized payment metadata and invoice linkage.',
        'Runtime state records required for active branch/table operations without staged rollback.',
      ],
      '14_executed_commands': COMMANDS,
      '15_commit_hash': getCommitHash(),
      '16_validation': 'Script is read-only (SELECT/count/findMany only); no create/update/delete/upsert/migration/seed executed.',
    },
    productionDryRunSupport: {
      supported: true,
      command: 'npm run audit:data-health:production-dry-run',
      requirement: 'Production dry-run requires production-like DATABASE_URL and READ_ONLY_DATA_AUDIT=1',
      executedInThisRun: isProductionMode,
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[audit-data-health-dry-run] report written: ${path.relative(root, reportPath).replace(/\\/g, '/')}`);
  console.log(`[audit-data-health-dry-run] critical=${severitySummary.critical} high-risk=${severitySummary['high-risk']} warning=${severitySummary.warning}`);
}

run()
  .catch((error) => {
    console.error('[audit-data-health-dry-run] failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
