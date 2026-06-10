#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apiRoot = path.join(root, 'app', 'api');
const reportPath = path.join(root, 'reports', 'api-route-guard-audit.json');

const mode = process.argv.includes('--report-only') ? 'report-only' : 'strict';

const guardSignals = [
  'requireTenant',
  'assertTenantCanAccess',
  'requireSystemAdmin',
  'getSessionFromRequest',
  'verifySessionToken',
  'requireAuth',
  'x-internal-secret',
  'INTERNAL_',
  'authorization',
];

const riskSignals = [
  'prisma.product',
  'prisma.productCategory',
  'prisma.posTable',
  'prisma.tableGroup',
  'prisma.order',
  'prisma.orderItem',
  'prisma.payment',
  'prisma.cash',
  'prisma.cashTransaction',
  'prisma.currentAccount',
  'prisma.currentAccountMovement',
  'prisma.stock',
  'prisma.stockItem',
  'prisma.stockMovement',
  'prisma.recipe',
  'prisma.recipeItem',
  'prisma.printer',
  'prisma.branch',
  'prisma.tenant',
  'prisma.subscription',
  'prisma.user',
  'tenantId',
  'branchId',
  'request.json()',
  'searchParams.get("tenantId")',
  "searchParams.get('tenantId')",
  'body.tenantId',
  'findMany',
  'findFirst',
  'findUnique',
  'update(',
  'updateMany',
  'delete(',
  'deleteMany',
  'upsert(',
  'create(',
  'createMany',
];

const tenantOwnedModelSignals = [
  'prisma.product',
  'prisma.productCategory',
  'prisma.posTable',
  'prisma.tableGroup',
  'prisma.order',
  'prisma.orderItem',
  'prisma.payment',
  'prisma.cash',
  'prisma.cashTransaction',
  'prisma.currentAccount',
  'prisma.currentAccountMovement',
  'prisma.stock',
  'prisma.stockItem',
  'prisma.stockMovement',
  'prisma.recipe',
  'prisma.recipeItem',
  'prisma.printer',
  'prisma.branch',
  'prisma.user',
  'prisma.subscription',
];

function walkRoutes(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRoutes(full));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function includesAny(text, arr) {
  return arr.filter((s) => text.includes(s));
}

function hasAny(text, arr) {
  return arr.some((s) => text.includes(s));
}

function classifyRoute(relativePath, code) {
  const hasRequireTenant = code.includes('requireTenant');
  const hasAssertTenantAccess = code.includes('assertTenantCanAccess');
  const hasRequireSystemAdmin = code.includes('requireSystemAdmin');
  const hasSessionGuard = code.includes('getSessionFromRequest') || code.includes('verifySessionToken') || code.includes('requireAuth');
  const hasInternalSecret = /x-internal-secret|internal secret|INTERNAL_[A-Z0-9_]+/.test(code);
  const hasSuperAdminGate = code.includes('isSuperAdmin(');
  const hasTenantMismatchGuard = /body\??\.tenantId\s*&&\s*body\??\.tenantId\s*!==\s*(session\.tenantId|tenantId)/.test(code);
  const hasPrisma = code.includes('prisma.');
  const hasTenantOwnedModel = hasAny(code, tenantOwnedModelSignals);
  const hasTenantIdFromInput = /searchParams\.get\((['"])tenantId\1\)|body\??\.tenantId|tenantId\s*=\s*body\??\.tenantId/.test(code);
  const hasBranchIdFromInput = /searchParams\.get\((['"])branchId\1\)|body\??\.branchId/.test(code);
  const hasWrite = /(update\(|updateMany|delete\(|deleteMany|upsert\(|create\(|createMany)/.test(code);
  const hasFind = /(findMany|findFirst|findUnique)/.test(code);
  const hasDataAccess = hasPrisma && (hasWrite || hasFind);
  const isSystemAdminPath = relativePath.startsWith('app/api/system-admin/');
  const isAuthPath = relativePath.startsWith('app/api/auth/');
  const isCommercialPath = relativePath.startsWith('app/api/commercial/');
  const isProxyRoute = code.includes('posBackendJson(') || code.includes('posBackendResponse(');
  const isPublicSafePath = relativePath === 'app/api/runtime-build-id/route.ts';

  let classification = 'public-safe';
  const reasons = [];

  if (isPublicSafePath) {
    classification = 'public-safe';
  } else if (isSystemAdminPath) {
    const hasEquivalentSystemAdminGuard = hasRequireSystemAdmin || (hasSessionGuard && hasSuperAdminGate);
    classification = hasEquivalentSystemAdminGuard ? 'system-admin-protected' : 'unsafe-candidate';
    if (!hasEquivalentSystemAdminGuard) reasons.push('system-admin route lacks requireSystemAdmin guard');
  } else if (hasRequireSystemAdmin) {
    classification = 'system-admin-protected';
  } else if (hasRequireTenant || hasAssertTenantAccess) {
    classification = 'tenant-protected';
  } else if (hasInternalSecret) {
    classification = 'internal-protected';
  } else if (isAuthPath || hasSessionGuard) {
    classification = 'auth-bootstrap';
  } else {
    classification = 'public-safe';
  }

  if (hasTenantOwnedModel && !hasRequireTenant && !hasRequireSystemAdmin && !hasAssertTenantAccess && !hasInternalSecret && !hasSessionGuard && !isAuthPath) {
    classification = 'unsafe-candidate';
    reasons.push('tenant-owned model access without tenant/system guard');
  }

  if (hasTenantIdFromInput && !hasRequireTenant && !hasRequireSystemAdmin && !hasAssertTenantAccess && !hasTenantMismatchGuard && !isAuthPath && !isSystemAdminPath && !isCommercialPath) {
    classification = 'unsafe-candidate';
    reasons.push('tenantId trusted from body/query/searchParams');
  }

  if (hasBranchIdFromInput && hasTenantOwnedModel && !hasRequireTenant && !hasRequireSystemAdmin && !isAuthPath) {
    classification = 'unsafe-candidate';
    reasons.push('branchId from input combined with data access without tenant guard');
  }

  if (/\/pos\/test\//.test(relativePath) && !hasRequireSystemAdmin && !hasRequireTenant) {
    classification = 'unsafe-candidate';
    reasons.push('test endpoint appears open without tenant/system guard');
  }

  if (isProxyRoute && !hasRequireTenant && !hasRequireSystemAdmin && !hasAssertTenantAccess) {
    classification = 'unsafe-candidate';
    reasons.push('backend proxy route missing tenant/system guard');
  }

  if ((hasDataAccess || hasPrisma) && classification === 'auth-bootstrap' && !hasRequireSystemAdmin && !hasRequireTenant) {
    reasons.push('auth/session style route with DB access; validate strict payload trust rules');
  }

  return {
    file: relativePath,
    classification,
    guardSignals: includesAny(code, guardSignals),
    riskSignals: includesAny(code, riskSignals),
    reasons,
    meta: {
      hasPrisma,
      hasTenantOwnedModel,
      hasTenantIdFromInput,
      hasBranchIdFromInput,
      hasSessionGuard,
      hasRequireTenant,
      hasRequireSystemAdmin,
      hasAssertTenantAccess,
      hasInternalSecret,
    },
  };
}

function ensureReportsDir() {
  const reportsDir = path.dirname(reportPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
}

function main() {
  const routes = walkRoutes(apiRoot);
  const analyzed = routes.map((filePath) => {
    const relative = path.relative(root, filePath).replace(/\\/g, '/');
    const code = read(filePath);
    return classifyRoute(relative, code);
  });

  const summary = {
    totalRoutes: analyzed.length,
    byClass: analyzed.reduce((acc, item) => {
      acc[item.classification] = (acc[item.classification] ?? 0) + 1;
      return acc;
    }, {}),
    unsafeCandidates: analyzed.filter((item) => item.classification === 'unsafe-candidate').length,
    generatedAt: new Date().toISOString(),
    mode,
  };

  const output = {
    summary,
    routes: analyzed.sort((a, b) => a.file.localeCompare(b.file)),
  };

  ensureReportsDir();
  fs.writeFileSync(reportPath, JSON.stringify(output, null, 2));

  console.log(`[audit-api-route-guards] report written: ${path.relative(root, reportPath).replace(/\\/g, '/')}`);
  console.log(`[audit-api-route-guards] total routes: ${summary.totalRoutes}, unsafe: ${summary.unsafeCandidates}`);

  if (mode !== 'report-only' && summary.unsafeCandidates > 0) {
    console.error('[audit-api-route-guards] unsafe candidates detected. Failing in strict mode.');
    process.exit(1);
  }
}

main();
