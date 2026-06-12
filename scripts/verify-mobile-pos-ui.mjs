#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

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

const failed = checks.filter((item) => !item.ok);
const report = {
  ok: failed.length === 0,
  viewportsCoveredByContract: ['360x800', '390x844', '414x896'],
  checks,
  failed,
  note: 'Static UI guard. Browser pixel proof still requires a running app and Playwright/browser access.',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (failed.length > 0) {
  console.error('[mobile-pos-ui] FAIL');
  for (const item of failed) console.error(`- ${item.id}: ${item.evidence}`);
  process.exit(1);
}

console.log('[mobile-pos-ui] PASS', JSON.stringify({ checks: checks.length, reportPath }));
