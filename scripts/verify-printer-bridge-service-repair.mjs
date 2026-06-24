import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const installer = fs.readFileSync(path.join(root, 'tools/agent-installer/Program.cs'), 'utf8');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('installer uses repair flow instead of install-only flow', installer.includes('RepairWindowsService(targetExe)') && installer.includes('private static void RepairWindowsService'));
check('repair inspects existing service config/path', installer.includes('GetServiceRawConfig(ServiceName)') && installer.includes('Existing service path is stale'));
check('repair deletes stale service path before recreating', installer.includes('sc.exe", "stop " + ServiceName') && installer.includes('sc.exe", "delete " + ServiceName'));
check('repair creates service when missing', installer.includes('sc.exe", "create " + ServiceName') && installer.includes('start= auto'));
check('repair refreshes existing service config when present', installer.includes('sc.exe", "config " + ServiceName') && installer.includes('DisplayName'));
check('repair enforces restart recovery policy', installer.includes('failure " + ServiceName') && installer.includes('restart/5000') && installer.includes('failureflag'));
check('repair starts service and falls back to process if still stopped', installer.includes('Bridge service did not reach RUNNING') && installer.includes('Process.Start(info)'));
check('service status exposes RUNNING STOPPED and NOT_FOUND states', installer.includes('RUNNING/running') && installer.includes('STOPPED/not-running') && installer.includes('NOT_FOUND/not-installed'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge service repair checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge service repair checks passed.`);
