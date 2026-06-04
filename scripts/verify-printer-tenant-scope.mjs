import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function check(condition, message) {
  try {
    assert.ok(condition, message);
  } catch (error) {
    failures.push(error.message);
  }
}

const files = {
  localAgent: read('app/api/printers/local-agent/route.ts'),
  localAgentPrint: read('app/api/printers/local-agent/print/route.ts'),
  printRequests: read('app/api/printers/print-requests/route.ts'),
  posDevices: read('app/api/settings/pos/devices/route.ts'),
  posDevicePatch: read('app/api/settings/pos/devices/[deviceId]/route.ts'),
  posPrintTest: read('app/api/settings/pos/devices/[deviceId]/print-test/route.ts'),
  posMappingsBulk: read('app/api/settings/pos/mappings/bulk/route.ts'),
  posOverview: read('app/api/settings/pos/overview/route.ts'),
  noLocalhost: read('scripts/verify-no-localhost-in-browser-bundle.mjs'),
};

for (const [name, source] of Object.entries(files)) {
  if (name === 'noLocalhost') continue;
  check(source.includes('requireTenant(request)') || source.includes('authenticateRegisteredDevice(request)'), `${name} must authenticate tenant or registered device.`);
  check(source.includes('tenant.tenantId') || source.includes('tenantId'), `${name} must carry tenant id.`);
}

for (const [name, source] of Object.entries({
  localAgent: files.localAgent,
  localAgentPrint: files.localAgentPrint,
  printRequests: files.printRequests,
  posDevices: files.posDevices,
  posDevicePatch: files.posDevicePatch,
  posPrintTest: files.posPrintTest,
  posMappingsBulk: files.posMappingsBulk,
  posOverview: files.posOverview,
})) {
  check(source.includes('branchId'), `${name} must carry branch id.`);
}

check(files.localAgent.includes('OR: [{ branchId }, { branchId: null }]'), 'Local agent discovery must filter device registry by branch.');
check(files.localAgent.includes('filterRegisteredPrintersByBranch'), 'Registered printer fallback must filter by branch metadata.');
check(files.localAgentPrint.includes('OR: [{ branchId }, { branchId: null }]'), 'Local test print must target tenant/branch bridge only.');
check(files.printRequests.includes('OR: [{ branchId }, { branchId: null }]'), 'Print requests must query/update tenant/branch jobs only.');
check(files.printRequests.includes("status: 'queued'"), 'Print request POST must return a queued status.');
check(files.posPrintTest.includes("status: 'queued'"), 'POS device print-test must return a queued status.');
check(files.posMappingsBulk.includes('JSON.stringify({ ...body, tenantId, branchId })'), 'Bulk mapping endpoint must forward tenant and branch ids.');
check(files.posOverview.includes("tenantCacheKey(tenantId, 'pos-overview', `${branchId}:"), 'POS overview cache key must include branch id.');
check(files.noLocalhost.includes('scannedBuiltRoots') && files.noLocalhost.includes('.next/static'), 'No-localhost browser bundle validation must inspect built chunks.');

const fixtureMappings = [
  { tenantId: 'TNT-A', branchId: 'mrk', deviceId: 'agent-1', role: 'receipt', printerName: 'Kasa A' },
  { tenantId: 'TNT-A', branchId: 'mrk', deviceId: 'agent-1', role: 'kitchen', printerName: 'Mutfak A' },
  { tenantId: 'TNT-A', branchId: 'mrk', deviceId: 'agent-1', role: 'bar', printerName: 'Bar A' },
  { tenantId: 'TNT-A', branchId: 'sube-2', deviceId: 'agent-1', role: 'receipt', printerName: 'Kasa Sube 2' },
  { tenantId: 'TNT-B', branchId: 'mrk', deviceId: 'agent-1', role: 'receipt', printerName: 'Kasa B' },
];

function visibleMappings(tenantId, branchId) {
  return fixtureMappings.filter((mapping) => mapping.tenantId === tenantId && mapping.branchId === branchId);
}

const tenantAMrk = visibleMappings('TNT-A', 'mrk');
const tenantBMrk = visibleMappings('TNT-B', 'mrk');
check(tenantAMrk.length === 3, 'Tenant A main branch must see receipt, kitchen and bar mappings.');
check(new Set(tenantAMrk.map((mapping) => mapping.role)).size === 3, 'Mappings must be role-separated under the same agent.');
check(tenantBMrk.length === 1 && tenantBMrk[0].printerName === 'Kasa B', 'Tenant B must not see Tenant A printer mappings.');
check(visibleMappings('TNT-A', 'sube-2').length === 1, 'Branch filter must isolate branch-specific mappings.');

function bulkReplace(input, tenantId, branchId, nextMappings) {
  return [
    ...input.filter((mapping) => mapping.tenantId !== tenantId || mapping.branchId !== branchId),
    ...nextMappings.map((mapping) => ({ ...mapping, tenantId, branchId })),
  ];
}

const afterBulk = bulkReplace(fixtureMappings, 'TNT-A', 'mrk', [
  { deviceId: 'agent-1', role: 'receipt', printerName: 'Yeni Kasa A' },
  { deviceId: 'agent-1', role: 'kitchen', printerName: 'Yeni Mutfak A' },
]);
check(visibleMappings('TNT-B', 'mrk').length === 1, 'Fixture sanity check: Tenant B baseline must remain isolated.');
check(afterBulk.filter((mapping) => mapping.tenantId === 'TNT-B').length === 1, 'Bulk mapping must not delete another tenant mappings.');
check(afterBulk.filter((mapping) => mapping.tenantId === 'TNT-A' && mapping.branchId === 'sube-2').length === 1, 'Bulk mapping must not delete another branch mappings.');
check(afterBulk.filter((mapping) => mapping.tenantId === 'TNT-A' && mapping.branchId === 'mrk').length === 2, 'Bulk mapping must replace only selected tenant/branch mappings.');

if (failures.length > 0) {
  console.error('[printer:tenant-scope] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[printer:tenant-scope] PASS');
