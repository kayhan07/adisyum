import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const installer = fs.readFileSync(path.join(root, 'tools/agent-installer/Program.cs'), 'utf8');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const diagnoseBlock = installer.slice(installer.indexOf('private static void PrintDiagnostics'), installer.indexOf('private static void RunProcess'));

check('diagnose prints service existence/status', diagnoseBlock.includes('Service: " + GetServiceStatus(ServiceName)') && installer.includes('STOPPED/not-running'));
check('diagnose prints service start type', diagnoseBlock.includes('Service start type:') && installer.includes('GetServiceStartType'));
check('diagnose prints service executable path', diagnoseBlock.includes('Service executable path:') && installer.includes('GetServiceExecutablePath'));
check('diagnose prints port 4891 owner', diagnoseBlock.includes('Port 4891 owner:') && installer.includes('GetPortOwner("4891")'));
check('diagnose checks health JSON', diagnoseBlock.includes('Health JSON:') && installer.includes('ReadHealthJson(2500)'));
check('diagnose checks printers JSON', diagnoseBlock.includes('Printers JSON:') && installer.includes('ReadPrintersJson(5000)'));
check('diagnose prints bridge log tail', diagnoseBlock.includes('Bridge log tail:') && installer.includes('ReadLogTail(BridgeLogPath, 120)'));
check('diagnose prints Windows service event log', diagnoseBlock.includes('Windows Event Log:') && installer.includes('ReadServiceEventLogTail(ServiceName, 10)'));
check('diagnose supports NOT_FOUND service state', installer.includes('NOT_FOUND/not-installed'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge stopped-service diagnose checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge stopped-service diagnose checks passed.`);
