import { spawnSync } from 'node:child_process';

const scenarios = {
  'tenant-data-isolation-final': [
    ['verify:tables-visible-across-devices', 'tables stay tenant and branch scoped'],
    ['verify:pos-catalog-categories', 'products and categories stay tenant scoped'],
    ['verify:current-accounts-excel-import', 'current accounts stay tenant and branch scoped'],
    ['verify:printer-role-assignment', 'printer roles stay tenant and branch scoped'],
    ['audit:prisma-tenant-scope', 'critical Prisma queries keep tenant scope'],
  ],
  'multi-device-tenant-realtime-final': [
    ['verify:tables-visible-across-devices', 'same tenant devices see the same table source of truth'],
    ['verify:table-order-realtime-sync', 'table orders sync across devices'],
    ['verify:tenant-realtime-product-sync', 'products and categories sync across devices'],
    ['verify:runtime-snapshot-merge-preserves-domain-data', 'runtime snapshot cannot erase POS domain data'],
    ['verify:runtime-refresh-idempotency', 'runtime refresh is idempotent'],
  ],
  'pos-backbone-final': [
    ['verify:pos-backbone-critical-flow', 'POS table order payment cash and print backbone works'],
    ['verify:order-composer-fast-flow', 'order composer can open table and add products quickly'],
    ['verify:daily-report-cash-register-flow', 'payment cash register and daily report flow works'],
  ],
  'printer-tenant-device-isolation-final': [
    ['verify:printer-agent-installed-printers', 'local installed printers are device scoped'],
    ['verify:printer-role-assignment', 'printer roles are tenant branch and role scoped'],
    ['verify:desktop-local-agent-preload-bridge', 'Desktop uses preload bridge for local printers'],
    ['verify:windows-uninstall-registry', 'Windows bridge appears in Add/Remove Programs'],
  ],
  'daily-report-cash-register-flow': [
    ['verify:pos-backbone-critical-flow', 'payments create cash register proof'],
    ['verify:daily-report-80mm-print', 'daily report renders 80mm output and print role'],
    ['verify:printer-role-assignment', 'daily report printer role and cashier fallback are valid'],
  ],
};

const scenario = process.argv[2];

if (!scenario || !scenarios[scenario]) {
  console.error(`Unknown final readiness scenario: ${scenario || '(empty)'}`);
  console.error(`Available: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;
let passed = 0;

for (const [script, reason] of scenarios[scenario]) {
  console.log(`\n[${scenario}] npm run ${script}`);
  console.log(`Reason: ${reason}`);
  const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = npmExecPath ? [npmExecPath, 'run', script] : ['run', script];
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(`Runner error: ${result.error.message}`);
    }
    console.error(`\nFAIL ${scenario}: ${script} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
  passed += 1;
}

console.log(`\nPASS ${scenario}: ${passed}/${passed} production readiness checks passed.`);
