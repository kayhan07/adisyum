import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const settings = read('app/settings/settings-client.tsx');
const integrationStore = read('lib/integration-store.ts');
const dailyReport = read('lib/daily-report-print.ts');
const printRequests = read('app/api/printers/print-requests/route.ts');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('printer roles include cashier kitchen bar and daily report', integrationStore.includes("'receipt_printer'") && integrationStore.includes("'kitchen_printer'") && integrationStore.includes("'bar_printer'") && integrationStore.includes("'daily_report_printer'"));
check('settings UI lets user assign daily report printer role', settings.includes("daily_report_printer: 'Günlük rapor yazıcı'") && settings.includes('Günlük rapor hattı'));
check('same physical printer can be assigned to different roles', settings.includes('samePrinterRegistration') && settings.includes('printer.connectionType !== nextPrinter.connectionType') && settings.includes('nextPrinter.systemName'));
check('role assignment stores tenant branch device diagnostic fields', integrationStore.includes('agentDeviceId') && integrationStore.includes('agentTenantId') && integrationStore.includes('agentBranchId') && settings.includes('agentDeviceId: agentDiagnostic.deviceId'));
check('receipt/adisyon print requests remain tenant branch role scoped', printRequests.includes('printerRole') && printRequests.includes('tenantId') && printRequests.includes('branchId'));
check('daily report uses daily report printer role', dailyReport.includes("printerRole: 'daily_report'"));
check('daily report falls back to cashier printer role when needed', dailyReport.includes("fallbackPrinterRole: 'cashier'"));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} printer role assignment checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} printer role assignment checks passed.`);
