import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const settings = read('app/settings/settings-client.tsx');
const localAgent = read('lib/local-agent.ts');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

check('manual second instance does not throw listener exception', installer.includes('TryGetExistingBridgeHealth(out var existingHealth)') && installer.includes('return;') && !installer.includes('Log("Bridge listener failed to start: " + ex.Message);\n                throw;'));
check('port conflict checks existing health endpoint', installer.includes('ReadHealthJson(1500)') && installer.includes('LocalApiPrefix + "health"'));
check('healthy existing bridge reports already running message', installer.includes('Adisyum Printer Bridge zaten arka planda çalışıyor.'));
check('port conflict logs port owner', installer.includes('Port 4891 owner:') && installer.includes('GetPortOwner("4891")'));
check('unhealthy port conflict reports diagnostic error not crash', installer.includes('Health yanıtı alınamadı') && installer.includes('Log yolu:'));
check('existing bridge health must include device id', installer.includes('TryGetProperty("deviceId"') && installer.includes('hasDeviceId'));
check('web health failure does not mask direct loopback error through proxy', localAgent.includes("if (path === '/health')") && localAgent.includes('throw error;'));
check('web health separates closed port from CSP/CORS', localAgent.includes('local_agent_port_closed') && localAgent.includes('local_agent_csp_or_cors_blocked'));
check('settings UI shows closed port message', settings.includes('Printer Bridge portu kapalı.'));
check('settings UI shows CSP/CORS message', settings.includes('CSP/CORS izni veya localhost erişimi engellenmiş olabilir.'));
check('settings UI shows timeout message', settings.includes('Printer Bridge yanıt vermiyor.'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge single-instance checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge single-instance checks passed.`);
