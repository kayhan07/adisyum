#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'saas-security-integrity-audit.json');

const routeRoot = path.join(root, 'app', 'api');
const sourceRoots = [
  path.join(root, 'app'),
  path.join(root, 'components'),
  path.join(root, 'lib'),
  path.join(root, 'scripts'),
];

const publicRouteAllowlist = new Set([
  'app/api/auth/login/route.ts',
  'app/api/auth/system-admin/route.ts',
  'app/api/auth/session/route.ts',
  'app/api/auth/security-score/route.ts',
  'app/api/runtime-build-id/route.ts',
  'app/api/downloads/windows/latest/route.ts',
  'app/api/downloads/windows/track/route.ts',
  'app/api/commercial/license/route.ts',
  'app/api/commercial/provision/route.ts',
  'app/api/commercial/remote-device/route.ts',
  'app/api/commercial/support/route.ts',
  'app/api/media/upload/route.ts',
]);

const tenantModels = [
  'product',
  'productCategory',
  'order',
  'orderItem',
  'payment',
  'cashTransaction',
  'currentAccountMovement',
  'stockItem',
  'stockMovement',
  'recipe',
  'recipeItem',
  'printer',
  'printerGroup',
  'branch',
  'user',
  'subscription',
  'runtimeState',
  'tenantDeviceRegistry',
  'deviceHeartbeat',
  'offlineEvent',
];

const requiredLiveProofMarkers = [
  'take: 50',
  'prisma.payment.findMany',
  'prisma.cashTransaction.findMany',
  'duplicateByReconciliationKey',
  "timeZone: 'Europe/Istanbul'",
  "row?.type === 'pos_payment'",
  'wrong environment: DATABASE_URL unavailable or unreachable',
  'LIVE_TEST_REQUIRE_DB_PROOF',
];

const findings = [];

function addFinding(severity, category, file, message, evidence = {}) {
  findings.push({ severity, category, file, message, evidence });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function walk(dir, predicate = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['.next', 'node_modules', '.git'].includes(entry.name)) continue;
      walk(full, predicate, out);
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function hasTenantGuard(code) {
  return /\brequireTenant\b|\bassertTenantCanAccess\b|\bauthenticateTenantSession\b|\bauthenticateRegisteredDevice\b/.test(code);
}

function hasSystemGuard(code) {
  return /\brequireSystemAdmin\b|\bisSuperAdmin\(/.test(code);
}

function hasSessionGuard(code) {
  return /\bgetSessionFromRequest\b|\bverifySessionToken\b|\bauthenticateTenantSession\b|\bauthenticateRegisteredDevice\b/.test(code);
}

function hasInternalGuard(code) {
  return /x-internal-secret|INTERNAL_[A-Z0-9_]+|CRON_SECRET|WEBHOOK_SECRET/.test(code);
}

function usesTenantOwnedPrisma(code) {
  return tenantModels.some((model) => new RegExp(`\\bprisma\\.${model}\\b`).test(code));
}

function usesUnsafeTenantInput(code) {
  return /body\??\.tenantId|searchParams\.get\((['"])tenantId\1\)|headers\.get\((['"])x-tenant/.test(code);
}

function hasTenantMismatchGuard(code) {
  return /body\??\.tenantId\s*&&\s*body\??\.tenantId\s*!==|tenantId\s*!==\s*(session|tenant|registeredDevice)|if\s*\([^)]*tenantId[^)]*!==/.test(code);
}

function hasPathTraversalRisk(code) {
  return /path\.join\([^)]*(searchParams|params|body|request)/.test(code) && !/normalize|basename|startsWith/.test(code);
}

function auditRoutes() {
  const routes = walk(routeRoot, (file) => path.basename(file) === 'route.ts');
  for (const file of routes) {
    const relative = rel(file);
    const code = read(file);
    const isPublicAllowed = publicRouteAllowlist.has(relative);
    const tenantGuard = hasTenantGuard(code);
    const systemGuard = hasSystemGuard(code);
    const sessionGuard = hasSessionGuard(code);
    const internalGuard = hasInternalGuard(code);
    const anyGuard = tenantGuard || systemGuard || sessionGuard || internalGuard || isPublicAllowed;

    if (relative.startsWith('app/api/system-admin/') && !systemGuard) {
      addFinding('critical', 'route-matrix', relative, 'System-admin API route is missing requireSystemAdmin/isSuperAdmin guard.');
    }

    if (!anyGuard && (usesTenantOwnedPrisma(code) || /posBackendJson|posBackendResponse/.test(code))) {
      addFinding('critical', 'route-matrix', relative, 'Tenant-owned data or backend proxy route lacks an explicit auth/tenant/system guard.');
    }

    if (usesUnsafeTenantInput(code) && !systemGuard && !hasTenantMismatchGuard(code) && !relative.startsWith('app/api/auth/')) {
      addFinding('high', 'tenant-input', relative, 'Route reads tenantId from body/query/header without an obvious session tenant mismatch guard.');
    }

    if (/POST|PATCH|PUT|DELETE/.test(code) && !anyGuard) {
      addFinding('high', 'write-guard', relative, 'Mutating route lacks an obvious guard.');
    }

    if (hasPathTraversalRisk(code)) {
      addFinding('high', 'path-traversal', relative, 'Route combines user-controlled input with path.join; verify traversal hardening.');
    }
  }
  return routes.length;
}

function auditPrinterAndDeviceRoutes() {
  const required = [
    ['app/api/printers/local-agent/route.ts', ['requireTenant', 'filterRegisteredPrintersByBranch', 'metadata.branchId']],
    ['app/api/printers/local-agent/print/route.ts', ['requireTenant', 'printerName', 'printerRole']],
    ['app/api/printers/print-requests/route.ts', ['requireTenant', 'printerName', 'printerRole']],
    ['app/api/devices/registry/route.ts', ['authenticateTenantSession', 'authenticateRegisteredDevice', 'body?.tenantId && body.tenantId !== tenantId']],
  ];
  for (const [relative, markers] of required) {
    const code = read(path.join(root, relative));
    for (const marker of markers) {
      if (!code.includes(marker)) {
        addFinding('critical', 'printer-device', relative, `Missing required printer/device tenant isolation marker: ${marker}`);
      }
    }
  }
}

function auditAuthAndSessionHardening() {
  const login = read(path.join(root, 'app/api/auth/login/route.ts'));
  const systemLogin = read(path.join(root, 'app/api/auth/system-admin/route.ts'));
  const session = read(path.join(root, 'lib/session.ts'));
  const middleware = read(path.join(root, 'middleware.ts'));

  if (!login.includes('verifyPassword') || !login.includes('setSessionCookie')) {
    addFinding('critical', 'auth', 'app/api/auth/login/route.ts', 'Tenant login must verify password and set a session cookie.');
  }
  if (!systemLogin.includes('require') && !systemLogin.includes('verifyPassword')) {
    addFinding('critical', 'auth', 'app/api/auth/system-admin/route.ts', 'System-admin login password verification marker missing.');
  }
  for (const marker of ['httpOnly', 'sameSite', 'secure']) {
    if (!session.includes(marker)) {
      addFinding('high', 'cookie', 'lib/session.ts', `Session cookie missing ${marker} marker.`);
    }
  }
  if (middleware && !/Content-Security-Policy|X-Frame-Options|frame-ancestors/.test(middleware)) {
    addFinding('medium', 'headers', 'middleware.ts', 'Middleware does not appear to set CSP/frame protections.');
  }
}

function auditTenantScopeHelpers() {
  const tableOrders = read(path.join(root, 'app/api/pos/table-orders/route.ts'));
  const runtimeTableState = read(path.join(root, 'app/api/runtime/table-state/route.ts'));
  const runtimeState = read(path.join(root, 'app/api/runtime/state/[scope]/route.ts'));
  const provider = read(path.join(root, 'components/providers/app-runtime-provider.tsx'));

  for (const marker of [
    'requireTenant(request)',
    'loadAuthoritativeOrdersByTable(tenant.tenantId',
    'persistAuthoritativeRuntimeTableState',
    "source: transactionResult.closed ? 'payment-closed' : 'partial-payment'",
    "type: 'pos_payment'",
    'duplicate payment mutation ignored',
  ]) {
    if (!tableOrders.includes(marker)) {
      addFinding('critical', 'pos-flow', 'app/api/pos/table-orders/route.ts', `Missing authoritative POS/payment marker: ${marker}`);
    }
  }
  if (!runtimeTableState.includes('runtimeStateTenantKey(tenant.tenantId')) {
    addFinding('critical', 'cache-scope', 'app/api/runtime/table-state/route.ts', 'Runtime table state cache key must include tenantId.');
  }
  if (!runtimeState.includes('runtimeStateTenantKey(target.tenantId')) {
    addFinding('critical', 'cache-scope', 'app/api/runtime/state/[scope]/route.ts', 'Runtime state cache key must include target tenantId.');
  }
  for (const marker of ['resetTenantIsolation', 'resetSystemAdminIsolation', 'bootstrapRuntimeScope']) {
    if (!provider.includes(marker)) {
      addFinding('high', 'client-state', 'components/providers/app-runtime-provider.tsx', `Client runtime provider missing tenant-switch isolation marker: ${marker}`);
    }
  }
}

function auditPrismaSchemaIndexes() {
  const schema = read(path.join(root, 'prisma/schema.prisma'));
  const requiredModelMarkers = [
    ['Payment', '@@index([tenantId, createdAt])', '@@index([tenantId, status])'],
    ['CashTransaction', '@@index([tenantId, createdAt])'],
    ['Order', '@@unique([tenantId, orderNo]', '@@index([tenantId, status])'],
    ['Product', '@@unique([tenantId, posKey]', '@@index([tenantId, active])'],
    ['Printer', '@@index([tenantId])'],
  ];
  for (const [model, ...markers] of requiredModelMarkers) {
    const modelBlock = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    if (!modelBlock) {
      addFinding('critical', 'schema', 'prisma/schema.prisma', `Missing model ${model}.`);
      continue;
    }
    if (!/\btenantId\b/.test(modelBlock)) {
      addFinding('critical', 'schema', 'prisma/schema.prisma', `${model} is tenant-owned but lacks tenantId.`);
    }
    for (const marker of markers) {
      if (!modelBlock.includes(marker)) {
        addFinding('medium', 'performance-index', 'prisma/schema.prisma', `${model} missing expected index/constraint marker: ${marker}`);
      }
    }
  }
}

function auditLiveAcceptanceScript() {
  const relative = 'scripts/verify-live-pos-business-flow.mjs';
  const code = read(path.join(root, relative));
  if (!code) {
    addFinding('critical', 'live-acceptance', relative, 'Live POS business flow verification script is missing.');
    return;
  }
  for (const marker of requiredLiveProofMarkers) {
    if (!code.includes(marker)) {
      addFinding('critical', 'live-acceptance', relative, `Live acceptance script missing DB proof marker: ${marker}`);
    }
  }
  if (/array_contains|path:\s*\[/.test(code)) {
    addFinding('critical', 'live-acceptance', relative, 'Live acceptance script must not use Prisma JSON filtering for DB proof.');
  }
}

function auditSensitiveLogging() {
  const files = sourceRoots.flatMap((dir) => walk(dir, (file) => /\.(ts|tsx|mjs|js)$/.test(file)));
  const risky = [];
  for (const file of files) {
    const relative = rel(file);
    if (relative.startsWith('scripts/audit-saas-security-integrity.mjs')) continue;
    const code = read(file);
    for (const line of code.split(/\r?\n/)) {
      if (!/console\.(log|warn|error|info)\(/.test(line)) continue;
      if (!/(password|token|secret|DATABASE_URL|cookie)/i.test(line)) continue;
      if (/passwordLength|passwordHashPresent|envFallbackConfigured|redact|mask|connection env/i.test(line)) continue;
      risky.push({ file: relative, snippet: line.trim().slice(0, 180) });
    }
  }
  for (const item of risky.slice(0, 20)) {
    addFinding('high', 'sensitive-logging', item.file, 'Potential sensitive value appears in console logging.', { snippet: item.snippet });
  }
}

function main() {
  const routeCount = auditRoutes();
  auditPrinterAndDeviceRoutes();
  auditAuthAndSessionHardening();
  auditTenantScopeHelpers();
  auditPrismaSchemaIndexes();
  auditLiveAcceptanceScript();
  auditSensitiveLogging();

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const summary = {
    ok: !findings.some((finding) => ['critical', 'high'].includes(finding.severity)),
    routeCount,
    findingCount: findings.length,
    bySeverity: findings.reduce((acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      return acc;
    }, {}),
    findings,
  };
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  if (summary.ok) {
    console.log('[saas-security-integrity] PASS', JSON.stringify({ routeCount, findingCount: findings.length, reportPath: rel(reportPath) }));
    return;
  }
  console.error('[saas-security-integrity] FAIL', JSON.stringify({ bySeverity: summary.bySeverity, reportPath: rel(reportPath) }));
  for (const finding of findings.filter((item) => ['critical', 'high'].includes(item.severity)).slice(0, 30)) {
    console.error(`- [${finding.severity}] ${finding.category} ${finding.file}: ${finding.message}`);
  }
  process.exit(1);
}

main();
