#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'restaurant-real-usage-flow-audit.json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const files = {
  orderComposer: 'components/order-composer.tsx',
  floorWorkspace: 'components/floor-workspace.tsx',
  tableOrdersRoute: 'app/api/pos/table-orders/route.ts',
  runtimeTableStateRoute: 'app/api/runtime/table-state/route.ts',
  runtimePosCatalogRoute: 'app/api/runtime/pos-catalog/route.ts',
  printerRequestsRoute: 'app/api/printers/print-requests/route.ts',
  printerLocalAgentRoute: 'app/api/printers/local-agent/route.ts',
  printerLocalAgentPrintRoute: 'app/api/printers/local-agent/print/route.ts',
  deviceRegistryRoute: 'app/api/devices/registry/route.ts',
  productsPage: 'app/products/page.tsx',
  productDomain: 'lib/product-domain.ts',
  productCatalog: 'lib/sale-product-catalog.ts',
  recipeEngine: 'lib/smart-recipe-stock-engine.ts',
  currentAccountRoute: 'app/api/finance/current-account-movements/route.ts',
  livePosScript: 'scripts/verify-live-pos-business-flow.mjs',
  mobileUiScript: 'scripts/verify-mobile-pos-ui.mjs',
  printerTenantScopeScript: 'scripts/verify-printer-tenant-scope.mjs',
  schema: 'prisma/schema.prisma',
};

const source = {};
for (const [key, relativePath] of Object.entries(files)) {
  source[key] = exists(relativePath) ? read(relativePath) : '';
}

const checks = [];

function check(id, ok, evidence, severity = 'high') {
  checks.push({ id, ok: Boolean(ok), severity, evidence });
}

function includesAll(text, tokens) {
  return tokens.every((token) => text.includes(token));
}

function regexAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

check(
  'table-payment-persists-authoritative-state',
  includesAll(source.tableOrdersRoute, [
    'persistAuthoritativeRuntimeTableState',
    "source: transactionResult.closed ? 'payment-closed' : 'partial-payment'",
    'runtimeTableStateKey',
    'tenantId',
  ]),
  'Payment mutations must persist authoritative branch table-state and expose the persisted key.',
);

check(
  'payment-closes-table-locally-and-live-total-zero',
  includesAll(source.orderComposer, [
    'replaceAuthoritativeOrdersByTable({ ...ordersByTable, [currentTableId]: [] })',
    'persistTableLiveTotals({ [currentTableId]: 0 })',
    'setPaymentOpen(false)',
    'updatePaymentRequested(currentTableId, false)',
  ]),
  'Full payment clears client order state, live totals, payment request state, and closes the panel.',
);

check(
  'cross-device-authoritative-sync',
  includesAll(source.orderComposer + source.floorWorkspace, [
    'refreshAuthoritativeOrdersByTable',
    'syncAuthoritativeOrders',
    'replaceAuthoritativeOrdersByTable',
    'setLiveTotals',
  ]),
  'Floor/order UI hydrates authoritative orders and live totals for cross-device refresh.',
);

check(
  'table-move-clears-source-and-preserves-target',
  regexAll(source.orderComposer, [
    /const moveCurrentTable\s*=\s*\(\)\s*=>/,
    /\[currentTable\.id\]: \[\]/,
    /\[moveTargetId\]: sourceOrders/,
    /updatePaymentRequested\(currentTable\.id, false\)/,
    /setSelectedTableId\(moveTargetId\)/,
  ]),
  'Move flow must empty the source table, transfer source lines, clear payment request state, and focus target table.',
);

check(
  'table-merge-clears-source-and-preserves-target-total',
  regexAll(source.orderComposer, [
    /const mergeCurrentTable\s*=\s*\(\)\s*=>/,
    /const mergedOrders = \[/,
    /\[currentTable\.id\]: remainingOrders/,
    /\[mergeTargetId\]: mergedOrders/,
    /updatePaymentRequested\(currentTable\.id, false\)/,
    /setSelectedTableId\(mergeTargetId\)/,
  ]),
  'Merge flow must move selected source lines into target and leave source with only remaining lines.',
);

check(
  'tenant-scoped-pos-order-route',
  includesAll(source.tableOrdersRoute, [
    'requireTenant',
    'tenantAuthErrorResponse',
    'tenantId',
    'branchId',
    'where: { tenantId_orderNo: { tenantId, orderNo } }',
    'where: { tenantId, orderId: order.id, status: \'paid\' }',
  ]),
  'POS order route must derive tenant from session and scope order/payment lookups.',
);

check(
  'payment-to-cash-transaction-chain',
  includesAll(source.tableOrdersRoute, [
    'tx.payment.create',
    'tx.cashTransaction.create',
    "type: 'pos_payment'",
    'paymentId: createdPayment.id',
    'reconciliationKey',
  ]),
  'Cash payments must create one linked CashTransaction with reconciliation metadata.',
);

check(
  'current-account-payment-chain',
  includesAll(source.tableOrdersRoute + source.currentAccountRoute, [
    'currentAccountMovement.create',
    'accountAmount',
    'paymentId: createdPayment.id',
    'current_account_collection',
  ]),
  'Account payments must create current-account movement and finance side effects.',
  'medium',
);

check(
  'daily-report-db-proof-uses-cash-transactions',
  includesAll(source.livePosScript, [
    'prisma.cashTransaction.findMany',
    "row?.type === 'pos_payment'",
    "timeZone: 'Europe/Istanbul'",
    'duplicateByReconciliationKey',
  ]),
  'Live verifier proves daily finance totals from CashTransaction rows in Europe/Istanbul day.',
);

check(
  'sellable-products-only-in-pos-catalog',
  includesAll(source.productDomain + source.runtimePosCatalogRoute, [
    'filterSellableProducts',
    'isSellableProductType',
    'compileTenantPosCatalog',
    'catalogRevision',
  ]),
  'Runtime POS catalog must filter non-sellable/raw ingredient products and publish revisioned catalog state.',
);

check(
  'product-price-snapshot-preserved',
  includesAll(source.orderComposer + source.productCatalog, [
    'snapshot',
    'price',
    'resolveSaleProductPrice',
    'catalogRevision',
  ]),
  'Order lines carry price/product snapshot markers so old checks are not broken by product price changes.',
  'medium',
);

check(
  'product-import-and-template-import-present',
  includesAll(source.productsPage, ['Upload', 'import', 'payload.products'])
    && exists('app/api/templates/import/route.ts')
    && exists('app/api/templates/packs/import/route.ts'),
  'Product/template import surfaces exist; Excel-specific browser proof still needs live UI test data.',
  'medium',
);

check(
  'recipe-stock-engine-present',
  includesAll(source.recipeEngine, ['recipe', 'stock', 'unit', 'quantity'])
    && /kg|gr|lt|ml/.test(source.recipeEngine),
  'Recipe/stock engine includes unit and quantity handling for stock deduction contracts.',
  'medium',
);

check(
  'printer-mobile-to-agent-queue',
  includesAll(source.printerRequestsRoute + source.printerLocalAgentPrintRoute, [
    'printer.job.queued',
    'tenantDeviceRegistry.findFirst',
    'branchId',
    'printerName',
    'printerRole',
  ]),
  'Mobile/API print requests queue tenant/branch-scoped jobs for an active local agent bridge.',
);

check(
  'printer-queue-idempotent-after-ack',
  includesAll(source.printerRequestsRoute, [
    'existingJob && ![\'pending\', \'failed\'].includes(existingJob.status)',
    'duplicate: true',
    'status: existingJob.status',
  ]),
  'Already acknowledged print jobs must not be requeued by a duplicate mutationId.',
);

check(
  'printer-agent-tenant-branch-discovery',
  includesAll(source.printerLocalAgentRoute, [
    'requireTenant',
    'OR: [{ branchId }, { branchId: null }]',
    'filterRegisteredPrintersByBranch',
    'metadata.branchId',
  ]),
  'Local agent discovery returns only tenant and branch-scoped registered printers.',
);

check(
  'device-registry-captures-installed-printers',
  includesAll(source.deviceRegistryRoute, [
    'tenantDeviceRegistry.upsert',
    'installedPrinters',
    'tenantId',
    'branchId',
  ]),
  'Computer agent can register installed printers for later mobile order printing.',
);

check(
  'mobile-payment-ui-guard-registered',
  exists(files.mobileUiScript) && includesAll(source.mobileUiScript, [
    'payment-action-footer-sticky',
    'mobile-toolbar-horizontal-scroll',
    'viewportsCoveredByContract',
  ]),
  'Mobile POS UI guard exists for 360/390/414 width contracts.',
);

check(
  'live-pos-business-flow-still-covers-db-printer-table-empty',
  includesAll(source.livePosScript, [
    'table remains empty after 5 seconds',
    'payment row created once',
    'cash movement row created once',
    'printer roles registered',
    'tenant B cannot see tenant A table/order',
    'tenant B cannot see tenant A payment',
  ]),
  'Existing live verifier covers payment DB proof, stale table prevention, printer roles, and tenant B isolation.',
);

check(
  'printer-tenant-scope-regression-script-present',
  exists(files.printerTenantScopeScript) && includesAll(source.printerTenantScopeScript, [
    'Tenant B must not see Tenant A printer mappings',
    'Mappings must be role-separated',
  ]),
  'Printer tenant isolation regression script exists.',
  'medium',
);

check(
  'schema-indexes-for-real-usage-models',
  includesAll(source.schema, [
    'model Payment',
    'model CashTransaction',
    'model TenantDeviceRegistry',
    'model Printer',
    '@@index([tenantId',
  ]),
  'Schema contains tenant-indexed core models for payment, cash, device, and printer flows.',
  'medium',
);

const liveRequested = process.env.LIVE_TEST_REQUIRE_DB_PROOF === '1';
const liveEnvReady = Boolean(
  process.env.LIVE_TEST_BASE_URL
    && process.env.LIVE_TEST_TENANT_ID
    && process.env.LIVE_TEST_USERNAME
    && process.env.LIVE_TEST_BRANCH_ID
    && process.env.DATABASE_URL,
);

const liveConfig = {
  baseUrl: (process.env.LIVE_TEST_BASE_URL || '').replace(/\/$/, ''),
  tenantId: process.env.LIVE_TEST_TENANT_ID || '',
  username: process.env.LIVE_TEST_USERNAME || 'admin',
  password: process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  branchId: process.env.LIVE_TEST_BRANCH_ID || 'mrk',
  tenantBId: process.env.LIVE_TEST_TENANT_B_ID || '',
  tenantBUsername: process.env.LIVE_TEST_TENANT_B_USERNAME || 'admin',
  tenantBPassword: process.env.LIVE_TEST_TENANT_B_PASSWORD || process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
};

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/password|cookie|token|secret/i.test(key)) return [key, '***'];
    return [key, redact(item)];
  }));
}

class HttpSession {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  cookieHeader() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
  }

  storeCookies(headers) {
    const raw = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : splitSetCookie(headers.get('set-cookie'));
    for (const cookie of raw) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  async request(method, urlPath, body, options = {}) {
    const url = urlPath.startsWith('http') ? urlPath : `${liveConfig.baseUrl}${urlPath}`;
    const headers = new Headers(options.headers || {});
    if (this.cookies.size) headers.set('Cookie', this.cookieHeader());
    if (body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: options.redirect || 'follow',
    });
    this.storeCookies(response.headers);
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? safeJson(text) : text;
    if (options.allowStatuses?.includes(response.status)) return { response, payload, text };
    if (!response.ok) throw new Error(`${method} ${urlPath} HTTP ${response.status}: ${text.slice(0, 500)}`);
    return { response, payload, text };
  }

  get(urlPath, options) { return this.request('GET', urlPath, undefined, options); }
  post(urlPath, body, options) { return this.request('POST', urlPath, body, options); }
  patch(urlPath, body, options) { return this.request('PATCH', urlPath, body, options); }
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function liveRecord(name, ok, detail = {}) {
  checks.push({ id: `live-${name}`, ok: Boolean(ok), severity: 'high', evidence: redact(detail) });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[restaurant-live] ${status} ${name}`, JSON.stringify(redact(detail)));
  if (!ok) throw new Error(`${name} failed`);
}

async function loginTenant(session, tenantId, username, password) {
  liveRecord(`${session.label}-password-configured`, Boolean(password), { hasPassword: Boolean(password) });
  const { response } = await session.post('/api/auth/login', { tenantId, username, password });
  liveRecord(`${session.label}-login`, response.status === 200 && session.cookies.size > 0, { status: response.status, cookieCount: session.cookies.size });
}

function runLivePosBusinessFlow() {
  const child = spawnSync(process.execPath, ['scripts/verify-live-pos-business-flow.mjs'], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  liveRecord('verify-live-pos-business-flow', child.status === 0, { status: child.status, signal: child.signal });
}

async function verifyLivePrinterQueue() {
  liveRecord('tenant-b-env-configured-for-printer-isolation', Boolean(liveConfig.tenantBId && liveConfig.tenantBPassword), {
    tenantBIdConfigured: Boolean(liveConfig.tenantBId),
    tenantBPasswordConfigured: Boolean(liveConfig.tenantBPassword),
  });

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const tenantA = new HttpSession('tenant-a');
  const tenantB = new HttpSession('tenant-b');
  await loginTenant(tenantA, liveConfig.tenantId, liveConfig.username, liveConfig.password);
  await loginTenant(tenantB, liveConfig.tenantBId, liveConfig.tenantBUsername, liveConfig.tenantBPassword);

  const deviceId = `REAL_USAGE_AGENT_${stamp}`;
  const printerNames = {
    receipt: `REAL_USAGE_KASA_${stamp}`,
    bar: `REAL_USAGE_BAR_${stamp}`,
    kitchen: `REAL_USAGE_MUTFAK_${stamp}`,
  };
  const printers = [
    { printerId: `${deviceId}-receipt`, name: printerNames.receipt, driver: 'REAL_USAGE', portName: 'VIRTUAL_RECEIPT', online: true, connectionType: 'virtual', escpos: true },
    { printerId: `${deviceId}-bar`, name: printerNames.bar, driver: 'REAL_USAGE', portName: 'VIRTUAL_BAR', online: true, connectionType: 'virtual', escpos: true },
    { printerId: `${deviceId}-kitchen`, name: printerNames.kitchen, driver: 'REAL_USAGE', portName: 'VIRTUAL_KITCHEN', online: true, connectionType: 'virtual', escpos: true },
  ];

  const registered = await tenantA.post('/api/devices/registry', {
    tenantId: liveConfig.tenantId,
    branchId: liveConfig.branchId,
    deviceId,
    hostname: `REAL_USAGE_HOST_${stamp}`,
    bridgeVersion: 'real-usage-test',
    printers,
    spoolerHealth: 'healthy',
    metadata: { source: 'verify-restaurant-real-usage-flow', stamp },
  });
  liveRecord('mock-local-agent-registered', registered.payload?.ok && registered.payload?.device?.deviceId === deviceId, { deviceId, printerCount: printers.length });

  const visible = await tenantA.get(`/api/printers/local-agent?branchId=${encodeURIComponent(liveConfig.branchId)}`, { allowStatuses: [200, 409] });
  const visibleNames = new Set((visible.payload?.printers || []).map((printer) => printer.name));
  liveRecord('tenant-a-sees-agent-printers', Object.values(printerNames).every((name) => visibleNames.has(name)), { names: Object.values(printerNames), visibleCount: visibleNames.size });

  const jobs = [];
  for (const [role, printerName] of Object.entries(printerNames)) {
    const mutationId = `REAL_USAGE_PRINT_${role}_${stamp}`;
    const queued = await tenantA.post('/api/printers/print-requests', {
      printerName,
      printerRole: role,
      targetDeviceId: deviceId,
      mutationId,
      source: 'mobile-order',
      bytesBase64: Buffer.from(`REAL_USAGE_${role}_${stamp}`).toString('base64'),
      metadata: { role, branchId: liveConfig.branchId, device: 'mobile', stamp },
    });
    liveRecord(`mobile-order-${role}-job-queued`, queued.payload?.ok && queued.payload?.status === 'queued' && queued.payload?.deviceId === deviceId && queued.payload?.role === role, {
      mutationId,
      deviceId: queued.payload?.deviceId,
      role: queued.payload?.role,
      printerName: queued.payload?.printerName,
    });
    jobs.push({ role, mutationId, id: queued.payload?.job?.id, printerName });
  }

  const pending = await tenantA.get(`/api/printers/print-requests?deviceId=${encodeURIComponent(deviceId)}`);
  const pendingByMutation = new Map((pending.payload?.jobs || []).map((job) => [job.mutationId, job]));
  liveRecord('agent-receives-three-role-jobs', jobs.every((job) => pendingByMutation.has(job.mutationId)), {
    expected: jobs.map((job) => job.mutationId),
    received: Array.from(pendingByMutation.keys()),
  });

  for (const job of jobs) {
    const ack = await tenantA.patch('/api/printers/print-requests', {
      jobId: job.id,
      deviceId,
      status: 'printed',
    });
    liveRecord(`agent-ack-${job.role}-printed`, ack.payload?.ok && ack.payload?.branchId === liveConfig.branchId, { jobId: job.id, branchId: ack.payload?.branchId });
  }

  const duplicate = await tenantA.post('/api/printers/print-requests', {
    printerName: jobs[0].printerName,
    printerRole: jobs[0].role,
    targetDeviceId: deviceId,
    mutationId: jobs[0].mutationId,
    source: 'mobile-order',
    bytesBase64: Buffer.from(`REAL_USAGE_DUPLICATE_${stamp}`).toString('base64'),
  });
  liveRecord('duplicate-print-mutation-not-requeued', duplicate.payload?.ok && duplicate.payload?.duplicate === true && duplicate.payload?.status === 'printed', {
    mutationId: jobs[0].mutationId,
    duplicate: duplicate.payload?.duplicate,
    status: duplicate.payload?.status,
  });

  const afterAck = await tenantA.get(`/api/printers/print-requests?deviceId=${encodeURIComponent(deviceId)}`);
  const stillPending = (afterAck.payload?.jobs || []).filter((job) => jobs.some((expected) => expected.mutationId === job.mutationId));
  liveRecord('agent-queue-empty-after-ack', stillPending.length === 0, { pendingCount: stillPending.length });

  const tenantBVisible = await tenantB.get(`/api/printers/local-agent?branchId=${encodeURIComponent(liveConfig.branchId)}`, { allowStatuses: [200, 409] });
  const tenantBPrinterNames = new Set((tenantBVisible.payload?.printers || []).map((printer) => printer.name));
  liveRecord('tenant-b-cannot-see-tenant-a-printers', Object.values(printerNames).every((name) => !tenantBPrinterNames.has(name)), { hidden: Object.values(printerNames) });

  const tenantBJobs = await tenantB.get(`/api/printers/print-requests?deviceId=${encodeURIComponent(deviceId)}`, { allowStatuses: [200, 403, 404] });
  const tenantBJobCount = Array.isArray(tenantBJobs.payload?.jobs) ? tenantBJobs.payload.jobs.length : 0;
  liveRecord('tenant-b-cannot-see-tenant-a-print-jobs', tenantBJobs.response.status !== 200 || tenantBJobCount === 0, { status: tenantBJobs.response.status, jobCount: tenantBJobCount });
}

async function main() {
  if (liveRequested && !liveEnvReady) {
    checks.push({
      id: 'live-wrong-environment',
      ok: false,
      severity: 'high',
      evidence: 'LIVE_TEST_REQUIRE_DB_PROOF=1 requires LIVE_TEST_BASE_URL, LIVE_TEST_TENANT_ID, LIVE_TEST_USERNAME, LIVE_TEST_BRANCH_ID and DATABASE_URL.',
    });
  }

  if (liveRequested && liveEnvReady) {
    runLivePosBusinessFlow();
    await verifyLivePrinterQueue();
  }

  const failed = checks.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    mode: liveRequested ? 'live-db-requested' : 'local-static-contract',
    liveDbProof: liveRequested
      ? {
          ready: liveEnvReady,
          status: liveEnvReady
            ? 'live-pos-db-and-printer-queue-proof-executed'
            : 'wrong-environment-missing-live-db-or-credentials',
        }
      : {
          ready: false,
          status: 'not-requested-local-static-contract-only',
        },
    checks,
    failed,
    caveats: [
      'Static source contracts are always checked.',
      'LIVE_TEST_REQUIRE_DB_PROOF=1 runs the live POS DB verifier and live printer queue receive/ack proof.',
      'Browser pixel proof is handled by verify:mobile-pos-ui with LIVE_TEST_BASE_URL and Playwright installed.',
    ],
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    console.error('[restaurant-real-usage-flow] FAIL');
    for (const item of failed) console.error(`- ${item.id}: ${typeof item.evidence === 'string' ? item.evidence : JSON.stringify(item.evidence)}`);
    process.exit(1);
  }

  console.log('[restaurant-real-usage-flow] PASS', JSON.stringify({
    mode: report.mode,
    checks: checks.length,
    liveDbProof: report.liveDbProof.status,
    reportPath,
  }));
}

main().catch((error) => {
  console.error('[restaurant-real-usage-flow] FAIL', error instanceof Error ? error.message : error);
  process.exit(1);
});
