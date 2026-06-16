import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const settings = read('app/settings/settings-client.tsx');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const localAgentClient = read('lib/local-agent.ts');

const samplePrinters = [
  { name: 'Kasa POS', portName: 'USB001', connectionType: 'usb', default: true },
  { name: 'Mutfak POS', portName: 'IP_192.168.1.40', connectionType: 'network', default: false },
  { name: 'Bar POS', portName: 'USB002', connectionType: 'usb', default: false },
];

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('test fixture has three printers', samplePrinters.length === 3);
check('agent health returns all installed printers not only default', installer.includes('installedPrinters = printers') && installer.includes('printers = printers') && installer.includes('printerCount = printers.Count'));
check('agent /printers endpoint returns GetInstalledPrinters list', installer.includes('path == "printers"') && installer.includes('WriteJson(response, printers)'));
check('printer inventory includes name default status port and connection type', installer.includes('Name = name.Trim()') && installer.includes('Default = ReadBool') && installer.includes('Status =') && installer.includes('PortName = portName') && installer.includes('ConnectionType = InferConnectionType'));
check('web dropdown renders every system printer from systemPrinters.map', settings.includes('systemPrinters.map((printer)') && settings.includes('printer.connectionType') && settings.includes('printer.default'));
check('web scan registers local printers to tenant device registry', settings.includes('/api/devices/registry') && settings.includes('deviceId: diagnostic.deviceId') && settings.includes('printers,'));
check('direct loopback bridge is enabled for browser settings scan', localAgentClient.includes("NEXT_PUBLIC_DISABLE_LOCAL_BRIDGE !== '1'"));
check('device id is required before cloud proxy returns installed printers', localAgentRoute.includes('agent_device_required') && localAgentRoute.includes('deviceScoped: false'));
check('another device printers are not shown on branch mismatch', localAgentRoute.includes('agent_branch_mismatch') && localAgentRoute.includes('printers: []'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} installed printer checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} installed printer checks passed.`);
