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

check('diagnose prints service status', installer.includes('Service: " + GetServiceStatus(ServiceName)'));
check('diagnose prints legacy service status', installer.includes('Legacy service: " + GetServiceStatus(LegacyServiceName)'));
check('diagnose prints port owner', installer.includes('Port 4891 owner: " + GetPortOwner("4891")'));
check('diagnose prints health JSON', installer.includes('Health JSON: " + ReadHealthJson(2500)'));
check('service status checks running state', installer.includes('RUNNING') && installer.includes('running'));
check('service status checks automatic start type', installer.includes('AUTO_START') && installer.includes('automatic'));
check('service status checks recovery restart policy', installer.includes('qfailure') && installer.includes('RESTART'));
check('port owner uses Get-NetTCPConnection first', installer.includes('Get-NetTCPConnection -LocalPort'));
check('port owner falls back to netstat', installer.includes('netstat.exe') && installer.includes('LISTENING'));
check('diagnose script opens installed exe with diagnose arg', installer.includes('" + targetExe + "\\" " + DiagnoseArg'));
check('health JSON reader calls local health endpoint', installer.includes('LocalApiPrefix + "health"') && installer.includes('ReadHealthJson'));
check('diagnostics still prints printer count', installer.includes('Printer count: " + printers.Count'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge diagnose health checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge diagnose health checks passed.`);
