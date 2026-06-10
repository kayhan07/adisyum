#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'prisma-tenant-scope-audit.json');
const mode = process.argv.includes('--report-only') ? 'report-only' : 'strict';

const TARGET_GLOBS = [
  path.join(root, 'app', 'api'),
  path.join(root, 'lib'),
];

const TENANT_MODELS = [
  'product',
  'productCategory',
  'posTable',
  'tableGroup',
  'order',
  'orderItem',
  'payment',
  'cashMovement',
  'cashTransaction',
  'currentAccount',
  'currentAccountMovement',
  'stockItem',
  'stockMovement',
  'warehouse',
  'recipe',
  'recipeItem',
  'printer',
  'printerGroup',
  'branch',
  'user',
  'subscription',
  'tenantSettings',
  'runtimeState',
  'syncQueue',
  'offlineEvent',
];

const OPERATIONS = [
  'findMany',
  'findFirst',
  'findUnique',
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
  'aggregate',
  'count',
  'groupBy',
];

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
const DANGEROUS_WRITE_OPS = new Set(['update', 'delete', 'upsert']);
const READ_SCOPED_OPS = new Set(['findMany', 'findFirst', 'findUnique', 'aggregate', 'count', 'groupBy']);

const compoundKeySignals = [
  'userTenantIdKey(',
  'runtimeStateTenantKey(',
  'branchTenantBranchKey(',
  'branchTenantIdKey(',
  'subscriptionTenantIdKey(',
  'roleTenantKey(',
  'permissionTenantKey(',
  'userTenantUsernameKey(',
  'tenantId_',
  'tenantId_branchId',
  'tenantId_key',
  'tenantId_id',
  'tenantId_reconciliationKey',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function ensureReportDir() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
}

function lineNumberFromIndex(text, index) {
  return text.slice(0, index).split('\n').length;
}

function extractWindow(lines, line, radiusBefore = 12, radiusAfter = 20) {
  const start = Math.max(0, line - 1 - radiusBefore);
  const end = Math.min(lines.length, line - 1 + radiusAfter + 1);
  return lines.slice(start, end).join('\n');
}

function fileContext(file, code) {
  return {
    isRoute: file.startsWith('app/api/'),
    isSystemAdminPath: file.startsWith('app/api/system-admin/') || file.startsWith('lib/system-admin/'),
    isAuthPath: file.startsWith('app/api/auth/'),
    isPublicRuntimePath: file === 'app/api/runtime-build-id/route.ts',
    hasRequireTenant: code.includes('requireTenant'),
    hasRequireSystemAdmin: code.includes('requireSystemAdmin'),
    hasAssertTenantCanAccess: code.includes('assertTenantCanAccess'),
    hasSessionGuard: code.includes('getSessionFromRequest') || code.includes('verifySessionToken') || code.includes('isSessionActive('),
    hasSuperAdminGate: code.includes('isSuperAdmin('),
    hasTenantContextType: code.includes('TenantContext') || code.includes('tenantWhere('),
  };
}

function hasTenantScope(text) {
  return (
    /where\s*:\s*\{[\s\S]{0,600}?\btenantId\b(?:\s*:|(?=\s*[,}]))/.test(text)
    || /where\s*:\s*tenantWhere\(/.test(text)
    || compoundKeySignals.some((signal) => text.includes(signal))
    || /tenantId\s*:\s*tenant\.[a-zA-Z0-9_]+/.test(text)
    || /tenantId\s*:\s*ctx\.[a-zA-Z0-9_]+/.test(text)
    || /tenantId\s*:\s*session\.[a-zA-Z0-9_]+/.test(text)
    || /where\s*:\s*\{[\s\S]{0,600}?\btenantId\b\s*,/.test(text)
  );
}

function hasTenantDataWrite(text) {
  return (
    /data\s*:\s*\{[\s\S]{0,600}?\btenantId\b(?:\s*:|(?=\s*[,}]))/.test(text)
    || /data\s*:\s*\[[\s\S]{0,600}?\btenantId\b(?:\s*:|(?=\s*[,}]))/.test(text)
    || /tenantId\s*:\s*tenant\.[a-zA-Z0-9_]+/.test(text)
    || /tenantId\s*:\s*ctx\.[a-zA-Z0-9_]+/.test(text)
    || /tenantId\s*:\s*session\.[a-zA-Z0-9_]+/.test(text)
    || /data\s*:\s*\{[\s\S]{0,600}?\btenantId\b\s*,/.test(text)
  );
}

function trustsTenantFromInput(text) {
  return /body\??\.tenantId|searchParams\.get\((['"])tenantId\1\)|record\[['"]tenantId['"]\]/.test(text);
}

function trustsBranchFromInput(text) {
  return /body\??\.branchId|searchParams\.get\((['"])branchId\1\)|record\[['"]branchId['"]\]|input\.branchId/.test(text);
}

function hasScopedLookupBefore(previousText, model) {
  const scopedLookup = new RegExp(`${model}\\.(findFirst|findUnique|count|aggregate)\\([\\s\\S]{0,500}?tenantId\\s*:`, 'm');
  return scopedLookup.test(previousText) || compoundKeySignals.some((signal) => previousText.includes(signal));
}

function classifyQuery({ file, code, model, operation, line, snippet, previousText }) {
  const ctx = fileContext(file, code);
  const scoped = hasTenantScope(snippet);
  const tenantDataWrite = hasTenantDataWrite(snippet);
  const bodyTenant = trustsTenantFromInput(snippet);
  const bodyBranch = trustsBranchFromInput(snippet);
  const scopedLookupBefore = hasScopedLookupBefore(previousText, model);
  const whereIdOnly = /where\s*:\s*\{[\s\S]{0,200}?id\s*:/.test(snippet) && !scoped;
  const usesSystemTenant = snippet.includes('SYSTEM_TENANT_ID') || snippet.includes('__system_admin__');

  let classification = 'review-needed';
  let risk = 'Static analyzer could not determine tenant scope with confidence.';

  if (ctx.isPublicRuntimePath) {
    classification = 'safe-public';
    risk = 'Public diagnostic route; no tenant-owned query classification required.';
  } else if (ctx.isSystemAdminPath || ctx.hasRequireSystemAdmin || (ctx.hasSessionGuard && ctx.hasSuperAdminGate) || usesSystemTenant) {
    classification = 'safe-system-admin';
    risk = 'System-admin/global access appears intentional and guarded.';
  } else if (ctx.isAuthPath) {
    if (operation === 'create' || operation === 'update' || operation === 'upsert' || operation === 'delete') {
      classification = bodyTenant ? 'review-needed' : 'review-needed';
      risk = 'Auth/bootstrap flow uses tenant-owned models; verify credential/bootstrap intent manually.';
    } else {
      classification = 'review-needed';
      risk = 'Auth/bootstrap query may be valid; verify manually.';
    }
  } else if (READ_SCOPED_OPS.has(operation)) {
    if (scoped) {
      classification = 'safe-tenant-scoped';
      risk = 'Read/query operation contains tenant scope.';
    } else if (bodyTenant) {
      classification = 'high-risk';
      risk = 'Tenant-owned read/query appears to trust tenantId from body/query/searchParams.';
    } else if (ctx.hasRequireTenant || ctx.hasAssertTenantCanAccess || ctx.hasTenantContextType || scopedLookupBefore) {
      classification = 'review-needed';
      risk = 'Guard/context exists but explicit tenantId filter not visible in this query.';
    } else {
      classification = 'high-risk';
      risk = 'Tenant-owned read/query does not show explicit tenantId scope.';
    }
  } else if (operation === 'create' || operation === 'createMany') {
    if (bodyTenant) {
      classification = 'high-risk';
      risk = 'Create operation appears to accept tenantId from request input.';
    } else if (tenantDataWrite) {
      classification = 'safe-tenant-scoped';
      risk = 'Create operation writes tenantId from trusted context.';
    } else if (ctx.hasRequireTenant || ctx.hasAssertTenantCanAccess || ctx.hasTenantContextType) {
      classification = 'review-needed';
      risk = 'Create operation has tenant context but static analyzer could not find explicit tenantId write.';
    } else {
      classification = 'high-risk';
      risk = 'Create operation does not show trusted tenantId assignment.';
    }
  } else if (DANGEROUS_WRITE_OPS.has(operation)) {
    if (bodyTenant) {
      classification = 'high-risk';
      risk = 'Write operation appears to trust tenantId from request input.';
    } else if (scoped || compoundKeySignals.some((signal) => snippet.includes(signal))) {
      classification = 'safe-tenant-scoped';
      risk = 'Write operation uses explicit tenant scope or compound tenant key.';
    } else if (whereIdOnly && scopedLookupBefore) {
      classification = 'review-needed';
      risk = 'Write targets id after an earlier tenant-scoped lookup; manual verification still recommended.';
    } else if (whereIdOnly && ctx.hasRequireTenant) {
      classification = 'dangerous-write';
      risk = 'Write targets id without visible tenant filter inside a tenant route.';
    } else if (ctx.hasRequireTenant || ctx.hasAssertTenantCanAccess || ctx.hasTenantContextType) {
      classification = 'dangerous-write';
      risk = 'Write operation has tenant context but no explicit tenant-scoped where clause is visible.';
    } else {
      classification = 'dangerous-write';
      risk = 'Write operation lacks explicit tenant scope and trusted tenant context.';
    }
  } else if (operation === 'updateMany' || operation === 'deleteMany') {
    if (bodyTenant) {
      classification = 'high-risk';
      risk = 'Bulk write appears to trust tenantId from request input.';
    } else if (scoped) {
      classification = 'safe-tenant-scoped';
      risk = 'Bulk write contains tenantId in where clause.';
    } else {
      classification = 'dangerous-write';
      risk = 'Bulk write has no visible tenant scope.';
    }
  }

  if (classification === 'safe-tenant-scoped' && bodyBranch && !snippet.includes('branchId: tenant.') && !snippet.includes('branchId: ctx.') && !snippet.includes('branchId: session.')) {
    risk = 'Tenant scope is present; branch scope should still be reviewed where branch-owned records exist.';
  }

  return {
    file,
    line,
    model,
    operation,
    classification,
    risk,
    snippet: snippet.split('\n').slice(0, 18).join('\n'),
  };
}

function analyzeFile(filePath) {
  const file = relative(filePath);
  const code = read(filePath);
  const lines = code.split(/\r?\n/);
  const findings = [];
  const regex = new RegExp(`(?:prisma|tx|db)\\.(${TENANT_MODELS.join('|')})\\.(${OPERATIONS.join('|')})\\(`, 'g');
  let match;
  while ((match = regex.exec(code)) !== null) {
    const model = match[1];
    const operation = match[2];
    const line = lineNumberFromIndex(code, match.index);
    const snippet = extractWindow(lines, line, 8, 22);
    const previousText = extractWindow(lines, line, 24, 0);
    findings.push(classifyQuery({ file, code, model, operation, line, snippet, previousText }));
  }
  return findings;
}

function summarize(findings, filesScanned) {
  const counts = {
    'safe-tenant-scoped': 0,
    'safe-system-admin': 0,
    'safe-public': 0,
    'review-needed': 0,
    'high-risk': 0,
    'dangerous-write': 0,
  };
  const modelDetails = {};
  const operationDetails = {};
  const fileDetails = {};

  for (const finding of findings) {
    counts[finding.classification] += 1;
    modelDetails[finding.model] ??= { total: 0, byClass: countsZero() };
    modelDetails[finding.model].total += 1;
    modelDetails[finding.model].byClass[finding.classification] += 1;

    operationDetails[finding.operation] ??= { total: 0, byClass: countsZero() };
    operationDetails[finding.operation].total += 1;
    operationDetails[finding.operation].byClass[finding.classification] += 1;

    fileDetails[finding.file] ??= { total: 0, byClass: countsZero(), findings: [] };
    fileDetails[finding.file].total += 1;
    fileDetails[finding.file].byClass[finding.classification] += 1;
    fileDetails[finding.file].findings.push(finding);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    filesScanned,
    totalTenantOwnedQueries: findings.length,
    ...counts,
    fileDetails,
    modelDetails,
    operationDetails,
  };
}

function countsZero() {
  return {
    'safe-tenant-scoped': 0,
    'safe-system-admin': 0,
    'safe-public': 0,
    'review-needed': 0,
    'high-risk': 0,
    'dangerous-write': 0,
  };
}

function main() {
  const files = TARGET_GLOBS.flatMap((dir) => walk(dir)).filter((filePath) => {
    const rel = relative(filePath);
    return rel.startsWith('app/api/') || rel.startsWith('lib/');
  });

  const findings = files.flatMap((filePath) => analyzeFile(filePath));
  const report = summarize(findings, files.length);
  ensureReportDir();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[audit-prisma-tenant-scope] report written: ${relative(reportPath)}`);
  console.log(`[audit-prisma-tenant-scope] files: ${report.filesScanned}, queries: ${report.totalTenantOwnedQueries}, high-risk: ${report['high-risk']}, dangerous-write: ${report['dangerous-write']}`);

  if (mode !== 'report-only' && (report['high-risk'] > 0 || report['dangerous-write'] > 0)) {
    console.error('[audit-prisma-tenant-scope] high-risk or dangerous-write findings detected.');
    process.exit(1);
  }
}

main();
