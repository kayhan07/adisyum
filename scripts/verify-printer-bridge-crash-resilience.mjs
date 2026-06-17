import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('listener start failures are logged explicitly', installer.includes('Bridge listener failed to start') && installer.includes('Log("Bridge listener failed to start: " + ex.Message)'));
check('request loop catches per-request failures', installer.includes('while (true)') && installer.includes('Request failed:') && installer.includes('status = "degraded"'));
check('request failure returns degraded JSON instead of plain crash response', installer.includes('WriteJson(context.Response, new') && installer.includes('ok = false') && installer.includes('logPath = BridgeLogPath'));
check('health avoids printer discovery and reads cache snapshot', installer.includes('ReadPrinterCacheSnapshot()') && !installer.slice(installer.indexOf('// ---------- GET /health ----------'), installer.indexOf('// ---------- GET /diagnostics ----------')).includes('GetInstalledPrinters('));
check('health response reports degraded status and log path', installer.includes('status = degraded ? "degraded" : "healthy"') && installer.includes('logPath = BridgeLogPath'));
check('printers endpoint degrades through timeout-controlled scan result', installer.includes('GetInstalledPrintersWithTimeout(PrinterScanTimeoutMs)') && installer.includes('error = scan.TimedOut ? "printer_scan_timeout" : scan.Error'));
check('diagnostics command cannot crash setup path', installer.includes('PrintDiagnostics()') && installer.includes('Printer discovery error:'));
check('log directory is under ProgramData logs folder', installer.includes('"logs"') && installer.includes('Directory.CreateDirectory(Path.GetDirectoryName(BridgeLogPath))'));
check('health still returns device id when degraded', installer.includes('var deviceId = EnsureDeviceId()') && installer.includes('deviceId = deviceId'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge crash resilience checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge crash resilience checks passed.`);
