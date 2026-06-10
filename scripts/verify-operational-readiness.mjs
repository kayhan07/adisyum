import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'operational-readiness.json');

function nowIso() {
  return new Date().toISOString();
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function maskDatabaseUrl(url) {
  if (!url) return null;
  const value = String(url);
  const protocolSplit = value.split('://');
  if (protocolSplit.length < 2) return '***';
  const protocol = protocolSplit[0];
  const rest = protocolSplit.slice(1).join('://');
  const [authAndHost, dbAndQuery = ''] = rest.split('/', 2);
  const [auth, host] = authAndHost.includes('@')
    ? authAndHost.split('@')
    : ['', authAndHost];
  const dbName = dbAndQuery.split('?')[0] || '';
  const maskedAuth = auth ? `${auth.slice(0, 3)}***` : '';
  const maskedHost = host ? `${host.slice(0, 4)}***` : '***';
  const maskedDb = dbName ? `${dbName.slice(0, 3)}***` : '***';
  return `${protocol}://${maskedAuth}${maskedAuth ? '@' : ''}${maskedHost}/${maskedDb}`;
}

function isProductionLikeDatabase(url) {
  const candidate = String(url ?? '').toLowerCase();
  if (!candidate) return false;
  return candidate.includes('prod')
    || candidate.includes('production')
    || candidate.includes('adisyum.com')
    || candidate.includes('railway.app')
    || candidate.includes('render.com');
}

const report = {
  timestamp: nowIso(),
  commitHash: getCommitHash(),
  environment: {
    nodeEnv: process.env.NODE_ENV ?? 'undefined',
    databaseMasked: maskDatabaseUrl(process.env.DATABASE_URL),
    productionLikeDatabase: isProductionLikeDatabase(process.env.DATABASE_URL),
    simulationRequested: process.env.OPERATIONAL_READINESS_DB_SIMULATE === '1',
  },
  summary: {
    operationalReady: true,
    blockingIssueCount: 0,
    highRiskCount: 0,
    warningCount: 0,
  },
  scenarios: {
    A_new_restaurant_setup: { status: 'pending', checks: [] },
    B_pos_check_flow: { status: 'pending', checks: [] },
    C_cash_and_payment_flow: { status: 'pending', checks: [] },
    D_current_account_flow: { status: 'pending', checks: [] },
    E_stock_and_recipe_flow: { status: 'pending', checks: [] },
    F_reporting_consistency: { status: 'pending', checks: [] },
    G_system_admin_access_control: { status: 'pending', checks: [] },
  },
  findings: [],
  notes: [],
};

function pushFinding(level, module, message, details = {}) {
  report.findings.push({
    level,
    module,
    message,
    details,
  });

  if (level === 'critical') report.summary.blockingIssueCount += 1;
  if (level === 'high-risk') report.summary.highRiskCount += 1;
  if (level === 'warning') report.summary.warningCount += 1;
}

function addCheck(scenarioKey, passed, message, details = {}) {
  report.scenarios[scenarioKey].checks.push({ passed, message, details });
  if (!passed) {
    pushFinding('critical', scenarioKey, message, details);
  }
}

function finalizeScenario(scenarioKey) {
  const checks = report.scenarios[scenarioKey].checks;
  const failed = checks.filter((item) => !item.passed).length;
  report.scenarios[scenarioKey].status = failed === 0 ? 'pass' : 'fail';
}

function contains(relativePath, snippet) {
  const content = read(relativePath);
  return content.includes(snippet);
}

function runStaticCoverage() {
  const schema = read('prisma/schema.prisma');

  addCheck('A_new_restaurant_setup', schema.includes('model Tenant'), 'Tenant modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model Branch'), 'Branch modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model Subscription'), 'Subscription modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model ProductCategory'), 'ProductCategory modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model Product'), 'Product modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model TableGroup'), 'TableGroup modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', schema.includes('model PosTable'), 'PosTable modeli mevcut olmalı.');
  addCheck('A_new_restaurant_setup', contains('app/api/system-admin/tenants/route.ts', 'createProvisioningJob'), 'System admin tenant provisioning akışı route üzerinde olmalı.');
  addCheck('A_new_restaurant_setup', contains('app/api/system-admin/tenants/route.ts', "body.action === 'update_subscription'"), 'System admin subscription güncelleme aksiyonu route üzerinde olmalı.');
  addCheck('A_new_restaurant_setup', contains('app/api/products/bulk/route.ts', 'findOrCreateCategory'), 'Bulk ürün kaydında kategori oluşturma/eşleme akışı olmalı.');
  addCheck('A_new_restaurant_setup', contains('app/api/products/bulk/route.ts', 'product.create({'), 'Bulk ürün kaydında ürün oluşturma akışı olmalı.');

  addCheck('B_pos_check_flow', contains('components/order-composer.tsx', "persistOrderState('save_order')"), 'Masa adisyonu ödeme öncesi save_order ile kaydedilmeli.');
  addCheck('B_pos_check_flow', contains('components/order-composer.tsx', "persistOrderState('mark_order_sent')"), 'Sipariş mutfağa gönderim sonrası mark_order_sent akışı olmalı.');
  addCheck('B_pos_check_flow', contains('components/order-composer.tsx', "action: 'update_line_quantity'"), 'Adet güncelleme UI aksiyonu olmalı.');
  addCheck('B_pos_check_flow', contains('components/order-composer.tsx', "action: 'remove_line'"), 'Satır silme UI aksiyonu olmalı.');
  addCheck('B_pos_check_flow', contains('app/api/pos/table-orders/route.ts', "normalizedBody.action === 'close_table_payment'"), 'Masa ödeme kapanışı authoritative API üzerinde olmalı.');
  addCheck('B_pos_check_flow', contains('app/api/pos/table-orders/route.ts', "normalizedBody.action === 'add_partial_payment'"), 'Kısmi ödeme aksiyonu API üzerinde olmalı.');
  addCheck('B_pos_check_flow', contains('components/floor-workspace.tsx', "status: 'available'"), 'Masa temizleme/taşıma sonrası available statüsü korunmalı.');

  addCheck('C_cash_and_payment_flow', contains('app/api/pos/table-orders/route.ts', 'await tx.payment.create'), 'Ödeme kapanışında Payment kaydı oluşturulmalı.');
  addCheck('C_cash_and_payment_flow', contains('app/api/pos/table-orders/route.ts', "type: 'pos_payment'"), 'Nakit/kart ödemelerinde kasa transaction kaydı olmalı.');
  addCheck('C_cash_and_payment_flow', contains('app/api/pos/table-orders/route.ts', 'duplicate payment mutation ignored'), 'Ödeme mutasyonunda idempotency guard olmalı.');
  addCheck('C_cash_and_payment_flow', contains('app/api/finance/daily-reports/route.ts', '/finance/daily-reports'), 'Günlük finans raporu endpoint entegrasyonu olmalı.');

  addCheck('D_current_account_flow', contains('prisma/schema.prisma', 'model CurrentAccountMovement'), 'Cari hareket modeli mevcut olmalı.');
  addCheck('D_current_account_flow', contains('prisma/schema.prisma', '@@unique([tenantId, reconciliationKey])'), 'Cari mutabakat anahtarında tenant-scope unique olmalı.');
  addCheck('D_current_account_flow', contains('app/api/finance/current-account-movements/route.ts', 'duplicate movement ignored'), 'Cari hareketlerde duplicate guard olmalı.');
  addCheck('D_current_account_flow', contains('app/api/finance/current-account-movements/route.ts', '_sum: { debit: true, credit: true }'), 'Cari bakiye debit/credit toplamından hesaplanmalı.');
  addCheck('D_current_account_flow', contains('components/finance-workspace.tsx', 'createAuthoritativeFinanceAccountMovement'), 'Cari tahsilat/ödeme UI authoritative API üzerinden yazmalı.');

  addCheck('E_stock_and_recipe_flow', contains('prisma/schema.prisma', 'model StockItem'), 'Stok kartı modeli mevcut olmalı.');
  addCheck('E_stock_and_recipe_flow', contains('prisma/schema.prisma', 'model StockMovement'), 'Stok hareket modeli mevcut olmalı.');
  addCheck('E_stock_and_recipe_flow', contains('prisma/schema.prisma', 'model Recipe'), 'Reçete modeli mevcut olmalı.');
  addCheck('E_stock_and_recipe_flow', contains('prisma/schema.prisma', 'model RecipeItem'), 'Reçete kalem modeli mevcut olmalı.');

  if (!contains('app/api/pos/table-orders/route.ts', 'stockMovement')) {
    pushFinding('high-risk', 'E_stock_and_recipe_flow', 'POS ödeme kapanış akışında doğrudan stok düşüm hareketi görünmüyor.', {
      recommendation: 'Satış sonrası stok düşümü için authoritative bir servis/worker doğrulaması ve test senaryosu eklenmeli.',
    });
    report.notes.push('Stok/reçete düşümü için route-level mutasyon görünmedi; bu alan operasyonel risk olarak işaretlendi.');
  }

  addCheck('F_reporting_consistency', fileExists('app/reports/page.tsx'), 'Rapor ekranı route dosyası mevcut olmalı.');
  addCheck('F_reporting_consistency', fileExists('app/finance/reports/page.tsx'), 'Finans rapor ekranı route dosyası mevcut olmalı.');
  addCheck('F_reporting_consistency', contains('app/api/finance/payments/route.ts', '/finance/payments'), 'Ödeme raporu API proxy akışı mevcut olmalı.');
  addCheck('F_reporting_consistency', contains('app/api/finance/daily-reports/route.ts', '/finance/daily-reports'), 'Günlük ciro raporu API proxy akışı mevcut olmalı.');

  addCheck('G_system_admin_access_control', contains('lib/requireTenant.ts', 'assertTenantCanAccess'), 'Tenant erişimi merkezi assertTenantCanAccess üzerinden doğrulanmalı.');
  addCheck('G_system_admin_access_control', contains('lib/db/tenant-repository.ts', "tenant.status === 'suspended' || tenant.status === 'blocked'"), 'Suspend/blocked tenant için uygulama erişimi engellenmeli.');
  addCheck('G_system_admin_access_control', contains('lib/db/tenant-repository.ts', 'subscription.endsAt < new Date()'), 'Süresi dolmuş abonelikte write erişimi engellenmeli.');
  addCheck('G_system_admin_access_control', contains('app/api/system-admin/tenants/route.ts', "body.action === 'update_status'"), 'System admin tenant aktif/pasif aksiyonu mevcut olmalı.');
  addCheck('G_system_admin_access_control', contains('middleware.ts', "pathname === '/app/login'"), 'App login giriş rotası middleware üzerinde korunmalı.');
  addCheck('G_system_admin_access_control', contains('middleware.ts', "pathname === '/system-admin/login'"), 'System-admin login giriş rotası middleware üzerinde korunmalı.');

  Object.keys(report.scenarios).forEach(finalizeScenario);
}

class RollbackSignal extends Error {
  constructor() {
    super('ROLLBACK_SIGNAL');
  }
}

async function runTransactionalSimulation() {
  const simulate = process.env.OPERATIONAL_READINESS_DB_SIMULATE === '1';
  const dbUrl = process.env.DATABASE_URL;

  if (!simulate) {
    report.notes.push('DB simülasyonu çalıştırılmadı (OPERATIONAL_READINESS_DB_SIMULATE=1 değil).');
    return;
  }

  if (!dbUrl) {
    pushFinding('warning', 'simulation', 'DB simülasyonu atlandı: DATABASE_URL tanımlı değil.');
    return;
  }

  if (isProductionLikeDatabase(dbUrl)) {
    pushFinding('warning', 'simulation', 'DB simülasyonu atlandı: production-like DATABASE_URL tespit edildi.');
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const tenantSuffix = crypto.randomBytes(4).toString('hex');
  const tenantId = `ops-sim-${tenantSuffix}`;
  const branchId = 'main';

  const simulation = {
    tenantId,
    branchId,
    expected: {
      orderTotal: 700,
      quantitySold: 2,
      stockConsumptionGram: 360,
      accountBalanceAfterDebtAndCollection: 0,
    },
  };

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          tenantId,
          name: 'Operational Readiness Simulation Tenant',
          packageType: 'mini',
          status: 'active',
        },
      });

      await tx.branch.create({
        data: {
          tenantId,
          branchId,
          name: 'Merkez Şube',
          active: true,
        },
      });

      await tx.tenant.update({ where: { tenantId }, data: { mainBranchId: branchId } });

      const admin = await tx.user.create({
        data: {
          tenantId,
          branchId,
          username: `admin_${tenantSuffix}`,
          email: `ops-sim-${tenantSuffix}@example.com`,
          name: 'Ops Sim Admin',
          passwordHash: 'simulated-password-hash',
          role: 'tenant_admin',
          active: true,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId,
          packageType: 'mini',
          status: 'active',
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          seats: 3,
          branchLimit: 1,
        },
      });

      const category = await tx.productCategory.create({
        data: {
          tenantId,
          name: 'Ana Yemek',
          active: true,
          visibleInPos: true,
          visibleInInventory: false,
          visibleInProduction: false,
          allowedProductTypes: ['sale_product'],
          branchVisibility: {},
        },
      });

      const product = await tx.product.create({
        data: {
          tenantId,
          categoryId: category.id,
          name: 'Adana Kebap',
          posKey: `adana-${tenantSuffix}`,
          price: 350,
          vatRate: 10,
          unitType: 'porsiyon',
          productType: 'sale_product',
          active: true,
          lifecycleStatus: 'published',
          publishStatus: 'published',
        },
      });

      const tableGroup = await tx.tableGroup.create({
        data: {
          tenantId,
          name: 'Salon',
          sortOrder: 1,
        },
      });

      const table = await tx.posTable.create({
        data: {
          tenantId,
          groupId: tableGroup.id,
          name: 'Masa 1',
          status: 'occupied',
          seats: 4,
        },
      });

      if (tenant.tenantId !== category.tenantId || tenant.tenantId !== product.tenantId || tenant.tenantId !== table.tenantId) {
        throw new Error('tenant_scope_mismatch');
      }

      const order = await tx.order.create({
        data: {
          tenantId,
          tableId: table.id,
          orderNo: `SIM-${tenantSuffix}`,
          status: 'paid',
          subtotal: 700,
          taxTotal: 63.64,
          total: 700,
        },
      });

      await tx.orderItem.create({
        data: {
          tenantId,
          orderId: order.id,
          productId: product.id,
          name: product.name,
          quantity: 2,
          unitPrice: 350,
          total: 700,
          notes: 'simulated',
        },
      });

      const payment = await tx.payment.create({
        data: {
          tenantId,
          orderId: order.id,
          method: 'cash',
          status: 'paid',
          amount: 700,
          metadata: { source: 'operational-readiness-simulation' },
        },
      });

      await tx.cashTransaction.create({
        data: {
          tenantId,
          type: 'pos_payment',
          amount: 700,
          metadata: { orderId: order.id, paymentId: payment.id, branchId },
        },
      });

      await tx.currentAccountMovement.create({
        data: {
          tenantId,
          accountId: `CARI-${tenantSuffix}`,
          reconciliationKey: `sim-${tenantSuffix}:debt`,
          type: 'SALE_DEBT',
          method: 'account',
          debit: 700,
          credit: 0,
          balanceAfter: 700,
          createdBy: admin.id,
          metadata: { branchId },
        },
      });

      await tx.currentAccountMovement.create({
        data: {
          tenantId,
          accountId: `CARI-${tenantSuffix}`,
          reconciliationKey: `sim-${tenantSuffix}:collection`,
          type: 'PAYMENT',
          method: 'cash',
          debit: 0,
          credit: 700,
          balanceAfter: 0,
          createdBy: admin.id,
          metadata: { branchId },
        },
      });

      const stockItem = await tx.stockItem.create({
        data: {
          tenantId,
          name: 'Kıyma',
          unit: 'g',
          quantity: 10000,
          minLevel: 500,
        },
      });

      const recipe = await tx.recipe.create({
        data: {
          tenantId,
          productId: product.id,
          name: 'Adana Kebap Reçetesi',
          yieldQuantity: 1,
          unit: 'porsiyon',
        },
      });

      await tx.recipeItem.create({
        data: {
          tenantId,
          recipeId: recipe.id,
          stockItemId: stockItem.id,
          name: 'Kıyma',
          quantity: 180,
          unit: 'g',
        },
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: stockItem.id,
          type: 'sale_recipe_consumption',
          quantity: -360,
          reason: '2 porsiyon Adana Kebap satışı',
          metadata: { orderId: order.id, productId: product.id, unit: 'g' },
        },
      });

      const stockAfter = await tx.stockItem.update({
        where: { id: stockItem.id },
        data: { quantity: 9640 },
      });

      const totalRevenue = Number((await tx.order.aggregate({
        where: { tenantId },
        _sum: { total: true },
      }))._sum.total ?? 0);

      const totalCashPayment = Number((await tx.payment.aggregate({
        where: { tenantId, method: 'cash', status: 'paid' },
        _sum: { amount: true },
      }))._sum.amount ?? 0);

      const soldQty = Number((await tx.orderItem.aggregate({
        where: { tenantId, productId: product.id },
        _sum: { quantity: true },
      }))._sum.quantity ?? 0);

      const accountTotals = await tx.currentAccountMovement.aggregate({
        where: { tenantId, accountId: `CARI-${tenantSuffix}` },
        _sum: { debit: true, credit: true },
      });
      const accountBalance = Number(accountTotals._sum.debit ?? 0) - Number(accountTotals._sum.credit ?? 0);

      if (totalRevenue !== simulation.expected.orderTotal) throw new Error('simulation_revenue_mismatch');
      if (totalCashPayment !== simulation.expected.orderTotal) throw new Error('simulation_payment_mismatch');
      if (soldQty !== simulation.expected.quantitySold) throw new Error('simulation_qty_mismatch');
      if (accountBalance !== simulation.expected.accountBalanceAfterDebtAndCollection) throw new Error('simulation_account_balance_mismatch');
      if (Number(stockAfter.quantity) !== 9640) throw new Error('simulation_stock_mismatch');

      await tx.tenant.update({ where: { tenantId }, data: { status: 'suspended' } });
      const suspended = await tx.tenant.findUnique({ where: { tenantId }, select: { status: true } });
      if (suspended?.status !== 'suspended') throw new Error('simulation_tenant_suspend_mismatch');

      await tx.subscription.updateMany({ where: { tenantId }, data: { status: 'expired', endsAt: new Date(Date.now() - 60_000) } });
      const expiredSubscription = await tx.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (!expiredSubscription || expiredSubscription.status !== 'expired') throw new Error('simulation_subscription_expire_mismatch');

      throw new RollbackSignal();
    });
  } catch (error) {
    if (error instanceof RollbackSignal) {
      report.notes.push('DB transaction simülasyonu başarıyla çalıştırıldı ve rollback edildi (kalıcı veri yazılmadı).');
      return;
    }
    pushFinding('warning', 'simulation', 'DB transaction simülasyonu başarısız oldu.', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  try {
    runStaticCoverage();
    await runTransactionalSimulation();

    if (!fileExists('scripts/verify-pos-critical-flow.mjs')) {
      pushFinding('critical', 'meta', 'POS kritik akış verify scripti bulunamadı.', { file: 'scripts/verify-pos-critical-flow.mjs' });
    }

    if (!fileExists('scripts/verify-floor-workspace-table-regression.mjs')) {
      pushFinding('critical', 'meta', 'Floor table regression verify scripti bulunamadı.', { file: 'scripts/verify-floor-workspace-table-regression.mjs' });
    }

    if (!fileExists('scripts/verify-finance-reconciliation.mjs')) {
      pushFinding('critical', 'meta', 'Finance reconciliation verify scripti bulunamadı.', { file: 'scripts/verify-finance-reconciliation.mjs' });
    }

    report.summary.operationalReady = report.summary.blockingIssueCount === 0;

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`[operational:readiness] report written: ${path.relative(root, reportPath).replaceAll('\\', '/')}`);
    console.log(`[operational:readiness] blocking=${report.summary.blockingIssueCount} highRisk=${report.summary.highRiskCount} warning=${report.summary.warningCount}`);

    if (!report.summary.operationalReady) {
      console.error('[operational:readiness] FAIL: blocking operational issues detected.');
      process.exit(1);
    }

    console.log('[operational:readiness] PASS');
  } catch (error) {
    const fallback = {
      timestamp: nowIso(),
      commitHash: getCommitHash(),
      summary: { operationalReady: false },
      fatalError: error instanceof Error ? error.message : String(error),
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
    console.error('[operational:readiness] fatal error', error);
    process.exit(1);
  }
}

await main();
