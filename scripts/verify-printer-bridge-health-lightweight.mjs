import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const settings = read('app/settings/settings-client.tsx');
const localAgent = read('lib/local-agent.ts');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const healthBlock = installer.slice(installer.indexOf('// ---------- GET /health ----------'), installer.indexOf('// ---------- GET /diagnostics ----------'));
const printersBlock = installer.slice(installer.indexOf('// ---------- GET /printers ----------'), installer.indexOf('// ---------- POST /print ----------'));

check('health handler does not call printer discovery', !healthBlock.includes('GetInstalledPrinters(') && !healthBlock.includes('GetInstalledPrintersWithTimeout'));
check('health reads printer cache snapshot only', healthBlock.includes('ReadPrinterCacheSnapshot()') && healthBlock.includes('cachedPrinterCount'));
check('health response includes last printer scan timestamp', healthBlock.includes('lastPrinterScanAt = cache.SavedAt'));
check('health uses short spooler timeout', healthBlock.includes('GetSpoolerStatus(HealthSpoolerTimeoutMs)') && installer.includes('HealthSpoolerTimeoutMs = 700'));
check('health always returns quickly with ok true and degraded status when needed', healthBlock.includes('ok = true') && healthBlock.includes('status = degraded ? "degraded" : "healthy"'));
check('printer discovery is isolated to printers endpoint', printersBlock.includes('GetInstalledPrintersWithTimeout(PrinterScanTimeoutMs)'));
check('printers endpoint returns cached printers on timeout', printersBlock.includes('printer_scan_timeout') && printersBlock.includes('cachedPrinters = printers'));
check('printer cache file is written by discovery', installer.includes('WritePrinterCache(printers, diagnostics)') && installer.includes('printer-cache.json'));
check('service start queues background printer discovery', installer.includes('QueuePrinterDiscovery("startup")') && installer.includes('ThreadPool.QueueUserWorkItem'));
check('browser health timeout is 2 seconds not 5 seconds', localAgent.includes("path === '/printers' ? 30000 : 2000") && localAgent.includes('/health 2 saniye'));
check('degraded health with device id is accepted by web client', localAgent.includes("path === '/health'") && localAgent.includes("healthPayload.status === 'degraded'"));
check('settings UI keeps agent online when printer scan times out', settings.includes('Yazıcı taraması zaman aşımına uğradı.') && settings.includes("localAgentResult.error === 'printer_scan_timeout'"));
check('settings UI can use cachedPrinters list', settings.includes('Array.isArray(data.cachedPrinters)'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge lightweight health checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge lightweight health checks passed.`);
