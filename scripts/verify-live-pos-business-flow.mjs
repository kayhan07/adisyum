#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

function loadEnvFile(file) {
  const full = path.join(rootDir, file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

for (const file of ['.env.local', '.env.production', '.env']) loadEnvFile(file);

const config = {
  baseUrl: (process.env.LIVE_TEST_BASE_URL || 'https://adisyum.com').replace(/\/$/, ''),
  tenantId: process.env.LIVE_TEST_TENANT_ID || 'ABN-48291',
  username: process.env.LIVE_TEST_USERNAME || 'admin',
  password: process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  branchId: process.env.LIVE_TEST_BRANCH_ID || 'mrk',
  systemUsername: process.env.LIVE_TEST_SYSTEM_USERNAME || process.env.LIVE_TEST_USERNAME || 'admin',
  systemPassword: process.env.LIVE_TEST_SYSTEM_PASSWORD || process.env.ADISYUM_SUPER_ADMIN_PASSWORD || process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  tenantBId: process.env.LIVE_TEST_TENANT_B_ID || '',
  tenantBUsername: process.env.LIVE_TEST_TENANT_B_USERNAME || 'admin',
  tenantBPassword: process.env.LIVE_TEST_TENANT_B_PASSWORD || process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  createTenantB: process.env.LIVE_TEST_CREATE_TENANT_B !== '0',
};

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const tableId = `LIVE_TEST_MASA_${stamp}`;
const productName = `LIVE_TEST_URUN_${stamp}`;
const tenantBProductName = `LIVE_TEST_B_URUN_${stamp}`;
const deviceId = `LIVE_TEST_DEVICE_${stamp}`;
const reconciliationKey = `LIVE_TEST_PAY_${stamp}`;
const printerNames = {
  receipt: `LIVE_TEST_KASA_${stamp}`,
  bar: `LIVE_TEST_BAR_${stamp}`,
  kitchen: `LIVE_TEST_MUTFAK_${stamp}`,
};

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[live-pos] ${status} ${name}`, JSON.stringify(redact(detail)));
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/password|cookie|token|secret/i.test(key)) return [key, '***'];
    return [key, redact(item)];
  }));
}

function assertStep(condition, name, detail = {}) {
  record(name, condition, detail);
  if (!condition) throw new Error(`${name} failed`);
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
    const url = urlPath.startsWith('http') ? urlPath : `${config.baseUrl}${urlPath}`;
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
    if (options.allowStatuses && options.allowStatuses.includes(response.status)) {
      return { response, payload, text };
    }
    if (!response.ok) {
      throw new Error(`${method} ${urlPath} HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    return { response, payload, text };
  }

  get(urlPath, options) { return this.request('GET', urlPath, undefined, options); }
  post(urlPath, body, options) { return this.request('POST', urlPath, body, options); }
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listCatalogItems(catalog) {
  if (Array.isArray(catalog?.items)) return catalog.items;
  if (Array.isArray(catalog?.catalog?.items)) return catalog.catalog.items;
  if (Array.isArray(catalog?.products)) return catalog.products;
  if (Array.isArray(catalog?.payload?.items)) return catalog.payload.items;
  return [];
}

function catalogBody(payload) {
  return payload?.catalog && typeof payload.catalog === 'object' ? payload.catalog : payload;
}

function itemName(item) {
  return item?.productSnapshot?.name || item?.name || item?.product?.name || '';
}

function itemPosKey(item) {
  return item?.productSnapshot?.posKey || item?.posKey || item?.product?.posKey || '';
}

function itemPrice(item) {
  return Number(item?.productSnapshot?.price ?? item?.price ?? item?.product?.price ?? 0);
}

function productPayloadFromCatalogItem(item, catalog, quantity = 1) {
  const snapshot = item.productSnapshot || item.product || item;
  return {
    id: snapshot.productId || snapshot.id,
    productId: snapshot.productId || snapshot.id,
    posKey: snapshot.posKey || item.posKey,
    legacyKey: snapshot.legacyKey || item.legacyKey,
    name: snapshot.name || item.name,
    price: Number(snapshot.price ?? item.price),
    category: snapshot.category || item.category || 'Mutfak',
    productType: snapshot.productType || item.productType || 'sale_product',
    revision: snapshot.revision || item.revision,
    catalogRevision: item.catalogRevision || snapshot.catalogRevision || catalog.catalogRevision,
    quantity,
    productSnapshot: {
      ...snapshot,
      catalogRevision: item.catalogRevision || snapshot.catalogRevision || catalog.catalogRevision,
    },
  };
}

function tableLines(payload, id = tableId) {
  return payload?.ordersByTable?.[id] || payload?.authoritativeState?.ordersByTable?.[id] || [];
}

function lineTotal(line) {
  return Number(line?.total ?? line?.lineTotal ?? (Number(line?.qty ?? line?.quantity ?? 0) * Number(line?.price ?? line?.unitPrice ?? 0)) ?? 0);
}

function tableTotal(payload, id = tableId) {
  return tableLines(payload, id).reduce((sum, line) => sum + lineTotal(line), 0);
}

async function loginTenant(session, tenantId, username, password) {
  assertStep(Boolean(password), `${session.label} password configured`, { hasPassword: Boolean(password) });
  const { response } = await session.post('/api/auth/login', { tenantId, username, password });
  assertStep(response.status === 200 && session.cookies.size > 0, `${session.label} tenant login`, { status: response.status, cookieCount: session.cookies.size });
  const app = await session.get('/app/login');
  assertStep(app.response.status === 200, `${session.label} app login page reachable`, { status: app.response.status });
}

async function loginSystemAdmin(session) {
  assertStep(Boolean(config.systemPassword), 'system admin password configured', { hasPassword: Boolean(config.systemPassword) });
  const { response } = await session.post('/api/auth/system-admin', { username: config.systemUsername, password: config.systemPassword });
  assertStep(response.status === 200 && session.cookies.size > 0, 'system admin login', { status: response.status, cookieCount: session.cookies.size });
  const page = await session.get('/system-admin/login');
  assertStep(page.response.status === 200, 'system admin login page reachable', { status: page.response.status });
}

async function ensureTenantB(systemSession) {
  if (config.tenantBId) return { tenantId: config.tenantBId, username: config.tenantBUsername, password: config.tenantBPassword };
  if (!config.createTenantB) throw new Error('LIVE_TEST_TENANT_B_ID is required when LIVE_TEST_CREATE_TENANT_B=0');
  const tenantId = `LVT-${stamp}`;
  const password = config.tenantBPassword || config.password;
  assertStep(Boolean(password), 'tenant B password configured', { hasPassword: Boolean(password) });
  const payload = {
    tenantId,
    companyName: `LIVE_TEST_TENANT_${stamp}`,
    legalName: `LIVE_TEST_TENANT_${stamp}`,
    packageType: 'premium',
    status: 'active',
    trialDays: 7,
    branchId: config.branchId,
    branchName: 'Merkez',
    adminUsername: config.tenantBUsername,
    adminPassword: password,
    adminName: 'Live Test Admin',
  };
  const { response, payload: created } = await systemSession.post('/api/system-admin/tenants', payload, { allowStatuses: [200, 201, 202] });
  assertStep([200, 201, 202].includes(response.status), 'tenant B provision request', { status: response.status, tenantId, ok: created?.ok });
  const tenantB = { tenantId, username: config.tenantBUsername, password };
  const probe = new HttpSession('tenant-b-probe');
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await loginTenant(probe, tenantB.tenantId, tenantB.username, tenantB.password);
      record('tenant B provision login ready', true, { attempt, tenantId });
      return tenantB;
    } catch (error) {
      if (attempt === 8) throw error;
      await sleep(3000);
    }
  }
  return tenantB;
}

async function ensureTestProduct(session, name) {
  const saved = await session.post('/api/products/bulk', {
    source: 'live-pos-business-flow',
    products: [{ name, category: 'Mutfak', productType: 'sale_product', salePrice: 100, vatRate: 10, unitType: 'portion' }],
  });
  assertStep(saved.payload?.ok && Number(saved.payload.savedCount ?? 0) >= 1, `product saved ${name}`, { savedCount: saved.payload?.savedCount, skippedCount: saved.payload?.skippedCount });
  await session.post('/api/runtime/pos-catalog', { branchId: config.branchId, channel: 'pos' }).catch(() => undefined);
  const [{ payload: catalog }, { payload: productsPayload }] = await Promise.all([
    session.get(`/api/runtime/pos-catalog?branchId=${encodeURIComponent(config.branchId)}&channel=pos`),
    session.get('/api/products/bulk'),
  ]);
  const normalizedCatalog = catalogBody(catalog);
  const items = listCatalogItems(catalog);
  const productRow = Array.isArray(productsPayload?.products)
    ? productsPayload.products.find((product) => product.name === name)
    : null;
  const item = items.find((entry) => itemName(entry) === name)
    || (productRow
      ? {
          catalogRevision: normalizedCatalog?.catalogRevision || `live-test-${stamp}`,
          productSnapshot: {
            productId: productRow.id,
            posKey: productRow.posKey,
            legacyKey: productRow.legacyKey,
            name: productRow.name,
            category: productRow.category || 'Mutfak',
            price: Number(productRow.price ?? 100),
            productType: productRow.productType || 'sale_product',
            revision: productRow.revision,
            lifecycleStatus: 'published',
            publishStatus: 'published',
          },
        }
      : null);
  record('runtime POS catalog visibility', items.some((entry) => itemName(entry) === name), { itemCount: items.length, catalogRevision: normalizedCatalog?.catalogRevision, usedProductListFallback: Boolean(productRow && !items.some((entry) => itemName(entry) === name)) });
  assertStep(Boolean(item), `catalog or product list contains product ${name}`, { itemCount: items.length, productListCount: productsPayload?.products?.length ?? 0, catalogRevision: normalizedCatalog?.catalogRevision });
  return { catalog: normalizedCatalog, item };
}

async function getOrders(session, id = tableId) {
  const { payload } = await session.get('/api/pos/table-orders');
  return { payload, lines: tableLines(payload, id), total: tableTotal(payload, id) };
}

async function maybeCreatePrisma() {
  if (process.env.LIVE_TEST_DB_VERIFY === '0' || process.env.LIVE_TEST_REQUIRE_DB_PROOF === '0') return null;
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$connect();
    return prisma;
  } catch {
    return null;
  }
}

async function verifyFinanceWithPrisma(prisma) {
  if (!prisma) {
    record('cash movement db verification', false, { reason: 'wrong environment: DATABASE_URL unavailable or unreachable; run on VPS for production DB proof' });
    return false;
  }
  const dayKey = (value) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value instanceof Date ? value : new Date(value));
  const todayIstanbul = dayKey(new Date());
  const payments = await prisma.payment.findMany({
    where: { tenantId: config.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const matchingPayments = payments.filter((payment) =>
    payment?.tenantId === config.tenantId
    && payment?.metadata?.reconciliationKey === reconciliationKey
  );
  const payment = matchingPayments[0] || null;
  const cashRows = await prisma.cashTransaction.findMany({
    where: { tenantId: config.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const matchingCash = cashRows.filter((row) =>
    row?.tenantId === config.tenantId
    && row?.metadata?.reconciliationKey === reconciliationKey
  );
  const cash = matchingCash[0] || null;
  const order = payment?.orderId
    ? await prisma.order.findFirst({ where: { tenantId: config.tenantId, id: payment.orderId } })
    : null;
  const paymentAmount = Number(payment?.amount ?? 0);
  const cashAmount = Number(cash?.amount ?? 0);
  const paymentBranch = payment?.metadata?.branchId;
  const cashBranch = cash?.metadata?.branchId;
  const expectedOrderNo = `TABLE-${tableId}`;
  const paymentOk = matchingPayments.length === 1
    && payment?.method === 'cash'
    && payment?.status === 'paid'
    && paymentAmount > 0
    && paymentBranch === config.branchId
    && order?.orderNo === expectedOrderNo;
  const cashOk = matchingCash.length === 1
    && cash?.type === 'pos_payment'
    && cashAmount === paymentAmount
    && cashBranch === config.branchId
    && cash?.metadata?.orderId === payment?.orderId;
  const duplicateByReconciliationKey = new Map();
  for (const row of cashRows) {
    const key = row?.metadata?.reconciliationKey;
    if (typeof key !== 'string' || !key.startsWith('LIVE_TEST_PAY_')) continue;
    duplicateByReconciliationKey.set(key, (duplicateByReconciliationKey.get(key) || 0) + 1);
  }
  const duplicateOk = matchingPayments.length === 1
    && matchingCash.length === 1
    && duplicateByReconciliationKey.get(reconciliationKey) === 1;
  const paymentDay = payment ? dayKey(payment.createdAt) : null;
  const cashDay = cash ? dayKey(cash.createdAt) : null;
  const dailyCashRows = cashRows.filter((row) =>
    row?.type === 'pos_payment'
    && row?.metadata?.branchId === config.branchId
    && dayKey(row.createdAt) === todayIstanbul
  );
  const dailyCashTotal = Number(dailyCashRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2));
  const dailyReportOk = paymentOk
    && cashOk
    && paymentDay === todayIstanbul
    && cashDay === todayIstanbul
    && dailyCashRows.some((row) => row?.metadata?.reconciliationKey === reconciliationKey)
    && dailyCashTotal >= cashAmount;

  record('payment row created once', paymentOk, {
    count: matchingPayments.length,
    method: payment?.method,
    status: payment?.status,
    amount: paymentAmount,
    branchId: paymentBranch,
    orderNo: order?.orderNo,
  });
  record('cash movement row created once', cashOk, {
    count: matchingCash.length,
    type: cash?.type,
    amount: cashAmount,
    branchId: cashBranch,
    orderLinked: cash?.metadata?.orderId === payment?.orderId,
  });
  record('duplicate cash/payment movement check', duplicateOk, {
    paymentCount: matchingPayments.length,
    cashMovementCount: matchingCash.length,
    duplicateByReconciliationKey: Object.fromEntries(duplicateByReconciliationKey),
  });
  record('daily report DB date proof', dailyReportOk, {
    todayIstanbul,
    paymentDay,
    cashDay,
    paymentIncluded: paymentDay === todayIstanbul,
    cashIncluded: cashDay === todayIstanbul,
    dailyCashTransactionCount: dailyCashRows.length,
    dailyCashTotal,
  });
  return paymentOk && cashOk && duplicateOk && dailyReportOk;
}

async function upsertPrintersWithPrisma(prisma) {
  if (!prisma) {
    record('printer role db setup skipped', true, { reason: 'DATABASE_URL unavailable; using device registry HTTP flow' });
    return false;
  }
  for (const [role, name] of Object.entries(printerNames)) {
    const existing = await prisma.printer.findFirst({ where: { tenantId: config.tenantId, name } });
    const data = {
      tenantId: config.tenantId,
      name,
      type: role,
      endpoint: `live-test://${role}`,
      active: true,
      metadata: { branchId: config.branchId, role, source: 'verify-live-pos-business-flow', stamp },
    };
    if (existing) await prisma.printer.update({ where: { id: existing.id }, data });
    else await prisma.printer.create({ data });
  }
  const rows = await prisma.printer.findMany({
    where: { tenantId: config.tenantId, active: true, name: { in: Object.values(printerNames) } },
  });
  const roles = new Set(rows.map((row) => row.type));
  record('printer roles registered', rows.length === 3 && ['receipt', 'bar', 'kitchen'].every((role) => roles.has(role)), { count: rows.length, roles: Array.from(roles) });
  return rows.length === 3 && ['receipt', 'bar', 'kitchen'].every((role) => roles.has(role));
}

async function registerPrinterDevice(session) {
  const printers = [
    { printerId: `${deviceId}-receipt`, name: printerNames.receipt, driver: 'LIVE_TEST', portName: 'LIVE_TEST_RECEIPT', online: true, connectionType: 'virtual', escpos: true },
    { printerId: `${deviceId}-bar`, name: printerNames.bar, driver: 'LIVE_TEST', portName: 'LIVE_TEST_BAR', online: true, connectionType: 'virtual', escpos: true },
    { printerId: `${deviceId}-kitchen`, name: printerNames.kitchen, driver: 'LIVE_TEST', portName: 'LIVE_TEST_KITCHEN', online: true, connectionType: 'virtual', escpos: true },
  ];
  const { payload } = await session.post('/api/devices/registry', {
    tenantId: config.tenantId,
    branchId: config.branchId,
    deviceId,
    hostname: `LIVE_TEST_HOST_${stamp}`,
    bridgeVersion: 'live-test',
    printers,
    spoolerHealth: 'healthy',
    metadata: { source: 'verify-live-pos-business-flow', stamp },
  });
  assertStep(payload?.ok && payload?.device?.deviceId === deviceId, 'printer device registered', { deviceId, printerCount: printers.length });
}

async function main() {
  const prisma = await maybeCreatePrisma();
  const tenantA = new HttpSession('tenant-a-device-a');
  const tenantADeviceB = new HttpSession('tenant-a-device-b');
  const system = new HttpSession('system-admin');

  const runtime = await fetch(`${config.baseUrl}/api/runtime-build-id`).then((response) => response.json());
  record('runtime build id reachable', runtime?.ok && Boolean(runtime.gitCommit), { gitCommit: runtime?.gitCommit, port: runtime?.port });

  await loginTenant(tenantA, config.tenantId, config.username, config.password);
  await loginTenant(tenantADeviceB, config.tenantId, config.username, config.password);
  await loginSystemAdmin(system);

  const tenantBInfo = await ensureTenantB(system);
  const tenantB = new HttpSession('tenant-b');
  await loginTenant(tenantB, tenantBInfo.tenantId, tenantBInfo.username, tenantBInfo.password);

  const initialProducts = await tenantA.get('/api/products/bulk');
  assertStep(initialProducts.payload?.ok && Array.isArray(initialProducts.payload.products), 'product list endpoint', { count: initialProducts.payload?.products?.length ?? 0 });

  const { catalog, item } = await ensureTestProduct(tenantA, productName);
  const bProduct = await ensureTestProduct(tenantB, tenantBProductName);
  const aCatalogAfterB = await tenantA.get(`/api/runtime/pos-catalog?branchId=${encodeURIComponent(config.branchId)}&channel=pos`);
  const bCatalogAfterA = await tenantB.get(`/api/runtime/pos-catalog?branchId=${encodeURIComponent(config.branchId)}&channel=pos`);
  assertStep(!listCatalogItems(aCatalogAfterB.payload).some((entry) => itemName(entry) === tenantBProductName), 'tenant A cannot see tenant B product', { productName: tenantBProductName });
  assertStep(!listCatalogItems(bCatalogAfterA.payload).some((entry) => itemName(entry) === productName), 'tenant B cannot see tenant A product', { productName });

  const product = productPayloadFromCatalogItem(item, catalog, 1);
  assertStep(Boolean(itemPosKey(item)) && itemPrice(item) > 0, 'catalog product is sellable', { name: itemName(item), posKey: itemPosKey(item), price: itemPrice(item) });

  const add = await tenantA.post('/api/pos/table-orders', {
    tableId,
    mutationId: `LIVE_TEST_ADD_${stamp}`,
    product,
  });
  const openTotal = tableTotal(add.payload);
  assertStep(add.payload?.ok && tableLines(add.payload).length > 0 && openTotal > 0, 'table opened and product added', { tableId, lineCount: tableLines(add.payload).length, total: openTotal });

  const deviceBOpen = await getOrders(tenantADeviceB);
  assertStep(deviceBOpen.lines.length > 0 && Math.abs(deviceBOpen.total - openTotal) < 0.01, 'device B sees same open table', { tableId, total: deviceBOpen.total });
  const tenantBOrders = await getOrders(tenantB, tableId);
  assertStep(tenantBOrders.lines.length === 0, 'tenant B cannot see tenant A table/order', { tableId, tenantBLineCount: tenantBOrders.lines.length });

  const payment = await tenantA.post('/api/pos/table-orders', {
    action: 'close_table_payment',
    tableId,
    mutationId: `LIVE_TEST_CLOSE_${stamp}`,
    payment: {
      method: 'cash',
      amount: openTotal,
      cashAmount: openTotal,
      scope: 'full',
      currency: 'TRY',
      reconciliationKey,
      receivedAt: new Date().toISOString(),
    },
  });
  assertStep(payment.payload?.ok && payment.payload.paymentState?.orderStatus === 'paid', 'cash payment closed order', {
    paymentCreated: payment.payload?.paymentCreated,
    remainingTotal: payment.payload?.paymentState?.remainingTotal,
    orderStatus: payment.payload?.paymentState?.orderStatus,
  });

  const afterClose = await getOrders(tenantA);
  assertStep(afterClose.lines.length === 0 && afterClose.total === 0, 'table closed immediately after payment', { tableId, lineCount: afterClose.lines.length, total: afterClose.total });
  await sleep(5500);
  const afterSync = await getOrders(tenantADeviceB);
  const tableState = await tenantA.get(`/api/runtime/table-state?branchId=${encodeURIComponent(config.branchId)}`);
  const liveTotal = tableState.payload?.state?.liveTotals?.[tableId] ?? 0;
  assertStep(afterSync.lines.length === 0 && afterSync.total === 0 && Number(liveTotal) === 0, 'table remains empty after 5 seconds', { tableId, lineCount: afterSync.lines.length, total: afterSync.total, liveTotal });

  const financeOk = await verifyFinanceWithPrisma(prisma);
  const printerDbOk = await upsertPrintersWithPrisma(prisma);
  await registerPrinterDevice(tenantA);
  const printerFallback = await tenantA.get(`/api/printers/local-agent?branchId=${encodeURIComponent(config.branchId)}`, { allowStatuses: [200, 409] }).catch((error) => ({ payload: { ok: false, error: error.message } }));
  const visiblePrinters = Array.isArray(printerFallback.payload?.printers) ? printerFallback.payload.printers : [];
  const visibleNames = new Set(visiblePrinters.map((printer) => printer.name));
  record('registered printers visible to tenant A', (printerDbOk || visiblePrinters.length >= 3) && Object.values(printerNames).every((name) => visibleNames.has(name)), { count: visiblePrinters.length, expected: Object.values(printerNames), source: printerDbOk ? 'db+device' : 'device-registry' });
  const tenantBPrinterFallback = await tenantB.get(`/api/printers/local-agent?branchId=${encodeURIComponent(config.branchId)}`, { allowStatuses: [200, 409] }).catch((error) => ({ payload: { ok: false, error: error.message } }));
  const tenantBPrinterNames = new Set((tenantBPrinterFallback.payload?.printers || []).map((printer) => printer.name));
  record('tenant B cannot see tenant A printers', Object.values(printerNames).every((name) => !tenantBPrinterNames.has(name)), { expectedHidden: Object.values(printerNames) });

  const tenantBPayments = prisma
    ? await prisma.payment.findMany({ where: { tenantId: tenantBInfo.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }).catch(() => [])
    : [];
  const tenantBPaymentsVisible = tenantBPayments.filter((payment) => payment?.metadata?.reconciliationKey === reconciliationKey).length;
  record('tenant B cannot see tenant A payment', tenantBPaymentsVisible === 0, { count: tenantBPaymentsVisible });

  await prisma?.$disconnect();
  const failed = results.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    runtimeBuildId: runtime?.gitCommit,
    tenantId: config.tenantId,
    branchId: config.branchId,
    tableId,
    productName,
    reconciliationKey,
    results,
    failed: failed.map((item) => item.name),
  };
  console.log(`[live-pos] REPORT ${JSON.stringify(redact(report), null, 2)}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  record('unhandled live POS verification error', false, { message: error.message });
  console.error(`[live-pos] FAIL ${error.stack || error.message}`);
  process.exit(1);
});
