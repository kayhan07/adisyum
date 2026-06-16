import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const settings = read('app/settings/settings-client.tsx');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const localAgentClient = read('lib/local-agent.ts');
const moduleCenter = read('components/module-center.tsx');
const login = read('app/app/login/page.tsx');

const checks = [];

function check(name, ok) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

check('login screen keeps Windows download center', login.includes('<DesktopSupportCenter />'));
check('post-login dashboard no longer renders Windows download center', !moduleCenter.includes('DesktopSupportCenter'));
check('agent offline message is readable Turkish', settings.includes('Yazıcı köprüsü çalışmıyor. Lütfen Printer Bridge uygulamasını açın.'));
check('device id missing message is readable Turkish', localAgentRoute.includes('Bu bilgisayarın Windows agent kimliği alınamadı.'));
check('local agent JSON responses declare UTF-8 charset', localAgentRoute.includes("'content-type': 'application/json; charset=utf-8'"));
check('agent health exposes tenant branch and device identity in UI', settings.includes('DeviceId:') && settings.includes('TenantId:') && settings.includes('BranchId:'));
check('agent response includes tenant branch and device identity', localAgentRoute.includes('tenantId: tenant.tenantId') && localAgentRoute.includes('branchId,') && localAgentRoute.includes('deviceId: device.deviceId'));
check('printer scan distinguishes no printer from bridge failure', settings.includes('bu bilgisayarda kurulu yazıcı yok') && settings.includes('Windows spooler kapalı'));
check('client proxy sends current computer device header', localAgentClient.includes("'x-adisyum-device-id': deviceId"));
check('installed printers are not fetched from another computer without device id', localAgentRoute.includes('agent_device_required') && localAgentRoute.includes('deviceScoped: false'));
check('same tenant branch different device id cannot see another device printers', localAgentRoute.includes('deviceId: requestedDeviceId') && localAgentRoute.includes('printers: []'));
check('default printer diagnostic keeps tenant scoped agent data', settings.includes('tenantId?: string | null') && localAgentRoute.includes('tenantId: tenant.tenantId'));

const failed = checks.filter((item) => !item.ok);

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} printer agent health UI checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} printer agent health UI checks passed.`);
