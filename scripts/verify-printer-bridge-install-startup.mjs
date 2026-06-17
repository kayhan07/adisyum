import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const desktop = read('apps/desktop/src/main.cjs');
const localAgent = read('lib/local-agent.ts');
const latest = read('public/downloads/windows/latest.json');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('Printer Bridge listens on the same port the web panel expects', installer.includes('http://127.0.0.1:4891/') && localAgent.includes("?? '4891'") && desktop.includes("http://127.0.0.1:4891"));
check('installer registers auto-start Windows service', installer.includes('sc.exe') && installer.includes('start= auto') && installer.includes('AdisyumPrinterBridge') && installer.includes('Adisyum Printer Bridge'));
check('installer registers logon startup fallback', installer.includes('schtasks.exe') && installer.includes('/SC ONLOGON') && installer.includes('CurrentVersion\\\\Run'));
check('installer starts bridge immediately after install', installer.includes('StartServiceOrFallback') && installer.includes('Process.Start(info)') && installer.includes('WaitForHealth()'));
check('desktop can start ProgramData bridge executable', desktop.includes('ProgramData') && desktop.includes('AdisyumDesktopBridge.exe'));
check('health endpoint exposes device id version spooler and printers', installer.includes('deviceId = deviceId') && installer.includes('version = BridgeVersion') && installer.includes('spooler = new') && installer.includes('installedPrinters = printers') && installer.includes('printerCount = printers.Count'));
check('bridge device id is generated and persisted', installer.includes('DeviceIdentityPath') && installer.includes('EnsureDeviceId()') && installer.includes('device-id.txt'));
check('CORS and private network headers allow HTTPS web to reach loopback bridge', installer.includes('Access-Control-Allow-Origin') && installer.includes('Access-Control-Allow-Private-Network'));
check('latest manifest keeps current Windows build id', latest.includes('windows-1781737725566'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} printer bridge install/startup checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} printer bridge install/startup checks passed.`);
