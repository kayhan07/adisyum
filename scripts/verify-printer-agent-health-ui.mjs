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
check(
  'agent offline message tells the user what to do',
  settings.includes('Bu bilgisayarda Printer Bridge çalışmıyor. Yazıcıları görebilmek için Printer Bridge’i kurup açın.')
    && localAgentRoute.includes('Bu bilgisayarda Printer Bridge çalışmıyor. Yazıcıları görebilmek için Printer Bridge’i kurup açın.'),
);
check('agent offline shows Printer Bridge download action', settings.includes('Printer Bridge’i İndir') && settings.includes('PRINTER_BRIDGE_LATEST_URL'));
check('agent offline shows rescan action', settings.includes('Yeniden Tara') && settings.includes('scanSystemPrinters()'));
check('agent offline shows installation help action', settings.includes('Kurulum Yardımı') && settings.includes('href="/app/login"'));
check('offline printer dropdown remains empty with explicit reason', settings.includes('systemPrinters.length === 0') && settings.includes('agentActionMessage'));
check('device id missing message is readable Turkish', localAgentRoute.includes('Bu bilgisayarın Windows agent kimliği alınamadı.'));
check('device id missing action asks for bridge restart', settings.includes('Bu bilgisayarın agent kimliği alınamadı. Printer Bridge’i yeniden başlatın.'));
check('old agent warning asks for current bridge install', settings.includes('Printer Bridge eski sürüm. Güncel sürümü indirip kurun.'));
check('spooler stopped warning is explicit', settings.includes('Windows Yazdırma Biriktiricisi kapalı. Windows Hizmetler’den Print Spooler’ı başlatın.'));
check('local agent JSON responses declare UTF-8 charset', localAgentRoute.includes("'content-type': 'application/json; charset=utf-8'"));
check('local bridge CORS allows adisyum browser requests', localAgentClient.includes('targetAddressSpace') && localAgentClient.includes("mode: 'cors'"));
check('Windows bridge allows health/printers CORS preflight', read('tools/agent-installer/Program.cs').includes('Access-Control-Allow-Origin"]          = allowedOrigin') && read('tools/agent-installer/Program.cs').includes('Content-Type, Authorization, x-adisyum-device-id') && read('tools/agent-installer/Program.cs').includes('request.HttpMethod == "OPTIONS"'));
check('agent online exposes device id version spooler and printer count', settings.includes('DeviceId:') && settings.includes('Agent sürümü:') && settings.includes('Spooler:') && settings.includes('Bulunan yazıcı:'));
check('agent online with printers fills the dropdown from systemPrinters', settings.includes('systemPrinters.map((printer)') && settings.includes('value={printer.name}'));
check('health parser accepts top-level and nested agent device id', settings.includes('payload.agent?.deviceId ?? payload.deviceId') && settings.includes('payload.agent?.agentVersion ?? payload.agent?.version ?? payload.version'));
check('printer parser accepts installedPrinters object response', settings.includes('Array.isArray(data.installedPrinters)') && settings.includes('data.installedPrinters'));
check('client proxy sends current computer device header', localAgentClient.includes("'x-adisyum-device-id': deviceId"));
check('browser settings scan can reach local Printer Bridge directly', localAgentClient.includes("NEXT_PUBLIC_DISABLE_LOCAL_BRIDGE !== '1'"));
check('settings scan registers bridge device and printers to cloud registry', settings.includes('/api/devices/registry') && settings.includes('registerLocalAgentDevice'));
check('installed printers are not fetched from another computer without device id', localAgentRoute.includes('agent_device_required') && localAgentRoute.includes('deviceScoped: false'));
check('same tenant branch different device id cannot see another device printers', localAgentRoute.includes('deviceId: requestedDeviceId') && localAgentRoute.includes('printers: []'));
check('default printer diagnostic keeps tenant scoped agent data', settings.includes('agentDeviceId') && settings.includes('agentTenantId') && settings.includes('agentBranchId'));

const failed = checks.filter((item) => !item.ok);

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} printer agent health UI checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} printer agent health UI checks passed.`);
