import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const installer = fs.readFileSync(path.join(root, 'tools/agent-installer/Program.cs'), 'utf8');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const waitBlock = installer.slice(installer.indexOf('private static void WaitForHealth'), installer.indexOf('private static void RunAgent'));
const mainBlock = installer.slice(installer.indexOf('private static int Main'), installer.indexOf('private static void InstallAndStartAgent'));

check('installer waits for /health after repair/start', installer.includes('StartServiceOrFallback(targetExe, installDir);') && installer.includes('WaitForHealth();'));
check('health gate calls 127.0.0.1 health endpoint', waitBlock.includes('LocalApiPrefix + "health"'));
check('health gate records last error for diagnostics', waitBlock.includes('string lastError') && waitBlock.includes('Last error:'));
check('health failure includes service state port owner and log path', waitBlock.includes('GetServiceStatus(ServiceName)') && waitBlock.includes('GetPortOwner("4891")') && waitBlock.includes('BridgeLogPath'));
check('health failure throws and makes installer fail', waitBlock.includes('throw new TimeoutException(message)') && mainBlock.includes('return 1;'));
check('successful health allows installer to continue', waitBlock.includes('Bridge health OK.') && mainBlock.includes('return 0;'));
check('printer discovery remains after health and is timeout controlled', mainBlock.includes('GetInstalledPrintersWithTimeout(PrinterScanTimeoutMs)'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge installer health-check checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge installer health-check checks passed.`);
