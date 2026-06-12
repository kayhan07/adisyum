#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'mobile-pos-ui-audit.json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const files = {
  orderComposer: 'components/order-composer.tsx',
  appShell: 'components/app-shell.tsx',
  floorPage: 'app/floor/page.tsx',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];

function check(id, ok, evidence, severity = 'high') {
  checks.push({ id, ok: Boolean(ok), severity, evidence });
}

check(
  'payment-panel-has-viewport-height-on-mobile',
  /paymentOpen\s*\?\s*'[^']*h-\[calc\(100dvh-7rem\)\][^']*max-h-\[calc\(100dvh-7rem\)\]/.test(source.orderComposer),
  'Payment mode constrains the POS product panel to mobile viewport height.',
);

check(
  'payment-body-scrolls',
  source.orderComposer.includes('overflow-y-auto')
    && source.orderComposer.includes('pb-28')
    && source.orderComposer.includes('min-h-0 flex-1'),
  'Payment content area is independently scrollable and leaves room for the action footer.',
);

check(
  'payment-action-footer-sticky',
  source.orderComposer.includes('sticky bottom-0')
    && source.orderComposer.includes('[padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)]')
    && source.orderComposer.includes('shadow-[0_-18px_36px'),
  'Primary payment action footer is sticky and safe-area aware.',
);

check(
  'payment-primary-action-remains-enabled-by-state',
  source.orderComposer.includes('disabled={paymentSubmitting || !canCompleteSplit || !canCompleteAccount || paidAmount < paymentTargetTotal || paymentTargetTotal <= 0}')
    && source.orderComposer.includes('{paymentSubmitting ?')
    && source.orderComposer.includes('paymentSubmitLabel'),
  'Payment button visibility is decoupled from validation; disabled state remains explicit.',
);

check(
  'mobile-header-is-compact',
  source.appShell.includes('px-3 py-2')
    && source.appShell.includes('text-lg font-semibold')
    && source.appShell.includes('hidden text-sm leading-6 sm:block'),
  'AppShell uses compact mobile spacing and hides long subtitles until small+ screens.',
);

check(
  'mobile-toolbar-horizontal-scroll',
  source.appShell.includes('flex-nowrap')
    && source.appShell.includes('overflow-x-auto')
    && source.appShell.includes('sm:flex-wrap')
    && source.appShell.includes('sm:overflow-visible'),
  'Tenant chips and toolbars stay in a horizontal mobile strip instead of covering content.',
);

check(
  'mobile-content-padding-reduced',
  source.appShell.includes('p-3 sm:p-5 lg:p-7'),
  'Default AppShell content uses smaller mobile padding for usable POS workspace.',
  'medium',
);

check(
  'floor-route-uses-immersive-app-shell',
  source.floorPage.includes('immersiveMode') && source.floorPage.includes('<FloorWorkspace />'),
  'Floor workspace is rendered in immersive mode with the compact header path.',
  'medium',
);

const liveRequested = Boolean(process.env.LIVE_TEST_BASE_URL);
const liveConfig = {
  baseUrl: (process.env.LIVE_TEST_BASE_URL || '').replace(/\/$/, ''),
  tenantId: process.env.LIVE_TEST_TENANT_ID || '',
  username: process.env.LIVE_TEST_USERNAME || 'admin',
  password: process.env.LIVE_TEST_PASSWORD || process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  branchId: process.env.LIVE_TEST_BRANCH_ID || 'mrk',
};

function record(id, ok, evidence, severity = 'high') {
  checks.push({ id, ok: Boolean(ok), severity, evidence });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[mobile-pos-ui] ${status} ${id}`, JSON.stringify(evidence));
  if (!ok && severity === 'high') throw new Error(`${id} failed`);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      return await import('@playwright/test');
    } catch {
      return null;
    }
  }
}

async function prepareOrder(page) {
  const tableId = `MOBILE_UI_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const result = await page.evaluate(async ({ branchId, tableId }) => {
    const catalogResponse = await fetch(`/api/runtime/pos-catalog?branchId=${encodeURIComponent(branchId)}&channel=pos`, { credentials: 'include' });
    const catalogPayload = await catalogResponse.json();
    const catalog = catalogPayload.catalog || catalogPayload;
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    const item = items.find((entry) => Number(entry.price ?? entry.productSnapshot?.price ?? 0) > 0) || items[0];
    if (!item) return { ok: false, error: 'catalog_empty' };
    const snapshot = item.productSnapshot || item.product || item;
    const product = {
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
      quantity: 1,
      productSnapshot: {
        ...snapshot,
        catalogRevision: item.catalogRevision || snapshot.catalogRevision || catalog.catalogRevision,
      },
    };
    const orderResponse = await fetch('/api/pos/table-orders', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tableId, mutationId: `${tableId}_ADD`, product }),
    });
    const orderPayload = await orderResponse.json().catch(() => null);
    return { ok: orderResponse.ok && orderPayload?.ok, status: orderResponse.status, tableId, productName: product.name };
  }, { branchId: liveConfig.branchId, tableId });
  record('live-order-prepared-for-payment-modal', result?.ok, result);
  return tableId;
}

async function runLiveBrowserProof() {
  record('live-browser-env-configured', Boolean(liveConfig.baseUrl && liveConfig.tenantId && liveConfig.username && liveConfig.password), {
    baseUrl: liveConfig.baseUrl,
    tenantIdConfigured: Boolean(liveConfig.tenantId),
    usernameConfigured: Boolean(liveConfig.username),
    passwordConfigured: Boolean(liveConfig.password),
  });

  const playwright = await loadPlaywright();
  record('playwright-installed-for-live-pixel-proof', Boolean(playwright?.chromium), {
    installed: Boolean(playwright?.chromium),
  });

  const screenshotDir = path.join(root, 'reports', 'mobile-pos-ui');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: liveConfig.baseUrl, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await page.goto('/app/login', { waitUntil: 'networkidle' });
    await page.locator('input').nth(0).fill(liveConfig.tenantId);
    await page.locator('input').nth(1).fill(liveConfig.username);
    await page.locator('input').nth(2).fill(liveConfig.password);
    await page.getByRole('button', { name: /giris|giriş/i }).click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    record('live-login-for-mobile-proof', true, { url: page.url() });

    const tableId = await prepareOrder(page);
    const viewports = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/floor', { waitUntil: 'networkidle' });
      const headerBox = await page.locator('.app-shell-header').first().boundingBox();
      const floorShot = path.join(screenshotDir, `floor-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: floorShot, fullPage: false });
      record(`live-floor-usable-${viewport.width}x${viewport.height}`, Boolean(headerBox && headerBox.height < viewport.height * 0.28), {
        headerHeight: headerBox?.height ?? null,
        viewport,
        screenshot: floorShot,
      });

      await page.goto(`/orders?tableId=${encodeURIComponent(tableId)}&payment=1`, { waitUntil: 'networkidle' });
      const paymentButton = page.getByRole('button', { name: /Tahsilatı tamamla|Kalan bakiyeyi tahsil et|Parçalı tahsilat ekle/i }).first();
      await paymentButton.waitFor({ state: 'visible', timeout: 20_000 });
      const buttonBox = await paymentButton.boundingBox();
      const enabled = await paymentButton.isEnabled();
      const modalShot = path.join(screenshotDir, `payment-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: modalShot, fullPage: false });
      record(`live-payment-button-visible-clickable-${viewport.width}x${viewport.height}`, Boolean(buttonBox && enabled && buttonBox.y >= 0 && buttonBox.y + buttonBox.height <= viewport.height), {
        buttonBox,
        enabled,
        viewport,
        screenshot: modalShot,
      });
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  if (liveRequested) await runLiveBrowserProof();

  const failed = checks.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    mode: liveRequested ? 'live-browser-pixel' : 'local-static-guard',
    viewportsCoveredByContract: ['360x800', '390x844', '414x896'],
    checks,
    failed,
    note: liveRequested
      ? 'Live browser pixel proof executed against LIVE_TEST_BASE_URL.'
      : 'Static UI guard. Set LIVE_TEST_BASE_URL and credentials to run browser pixel proof.',
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    console.error('[mobile-pos-ui] FAIL');
    for (const item of failed) console.error(`- ${item.id}: ${typeof item.evidence === 'string' ? item.evidence : JSON.stringify(item.evidence)}`);
    process.exit(1);
  }

  console.log('[mobile-pos-ui] PASS', JSON.stringify({ mode: report.mode, checks: checks.length, reportPath }));
}

main().catch((error) => {
  console.error('[mobile-pos-ui] FAIL', error instanceof Error ? error.message : error);
  process.exit(1);
});
