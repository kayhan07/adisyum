import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const desktopMain = read('apps/desktop/src/main.cjs');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('service name is AdisyumPrinterBridge', installer.includes('private const string ServiceName = "AdisyumPrinterBridge"'));
check('service display name is human-readable', installer.includes('private const string ServiceDisplayName = "Adisyum Printer Bridge"'));
check('service command starts the installed ProgramData bridge exe in run-agent mode', installer.includes('binPath=') && installer.includes('targetExe + " " + RunArg'));
check('service is configured auto-start', installer.includes('start= auto'));
check('service starts immediately after install when elevated', installer.includes('if (IsAdministrator()) RunProcess("sc.exe", "start " + ServiceName, false)'));
check('service failure policy restarts bridge', installer.includes('failure " + ServiceName') && installer.includes('restart/5000'));
check('logon scheduled task fallback is registered', installer.includes('/SC ONLOGON') && installer.includes('/RL HIGHEST'));
check('registry run fallback uses new service key', installer.includes('runKey.SetValue(ServiceName') && installer.includes('CurrentVersion\\\\Run'));
check('installer waits for health endpoint after start', installer.includes('WaitForHealth()') && installer.includes(LocalApiPrefixLiteral()));
check('desktop shell can still start ProgramData bridge executable', desktopMain.includes('ProgramData') && desktopMain.includes('AdisyumDesktopBridge.exe'));

function LocalApiPrefixLiteral() {
  return 'http://127.0.0.1:4891/';
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge service startup checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge service startup checks passed.`);
