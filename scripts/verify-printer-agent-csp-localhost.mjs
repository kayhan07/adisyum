import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const middleware = read('middleware.ts');
const localAgentClient = read('lib/local-agent.ts');
const settings = read('app/settings/settings-client.tsx');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const auditRuntime = read('scripts/audit-production-runtime.mjs');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const cspMatch = middleware.match(/content-security-policy['"],\s*([\s\S]*?)\n\s*\);/);
const csp = cspMatch?.[1] ?? '';
const connectSrcMatch = csp.match(/connect-src\s+([^;"]+);/);
const connectSrc = connectSrcMatch?.[1]?.trim() ?? '';
const scriptSrcMatch = csp.match(/script-src\s+([^;"]+);/);
const scriptSrc = scriptSrcMatch?.[1]?.trim() ?? '';

check('production CSP has connect-src directive', Boolean(connectSrcMatch));
check('production CSP connect-src allows 127.0.0.1 Printer Bridge', connectSrc.includes('http://127.0.0.1:4891'));
check('production CSP connect-src allows localhost Printer Bridge', connectSrc.includes('http://localhost:4891'));
check('production CSP connect-src omits invalid IPv6 loopback source', !connectSrc.includes('http://[::1]:4891'));
check('production CSP connect-src keeps self/https/ws/wss', ["'self'", 'https:', 'ws:', 'wss:'].every((token) => connectSrc.includes(token)));
check('production CSP connect-src has no wildcard', !connectSrc.includes('*'));
check('production CSP connect-src does not allow broad http scheme', !/(^|\s)http:(\s|$)/.test(connectSrc));
check('production CSP connect-src does not allow unexpected loopback ports', !/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(?!4891\b)\d+/.test(connectSrc));
check('script-src is not loosened for Printer Bridge', scriptSrc === "'self' 'unsafe-inline' https://static.cloudflareinsights.com");

const firstLoopbackIndex = localAgentClient.indexOf("buildLoopbackBase('http', '127.0.0.1', httpPort)");
const secondLoopbackIndex = localAgentClient.indexOf("buildLoopbackBase('http', 'localhost', httpPort)");
check('local bridge health tries 127.0.0.1:4891 before localhost:4891', firstLoopbackIndex >= 0 && secondLoopbackIndex > firstLoopbackIndex);
check('local bridge default port is 4891', localAgentClient.includes("NEXT_PUBLIC_LOCAL_BRIDGE_PORT ?? '4891'"));
check('local bridge HTTPS fallback is opt-in only', localAgentClient.includes("NEXT_PUBLIC_LOCAL_BRIDGE_ENABLE_HTTPS === '1'"));
check('settings UI marks agent online after health success', settings.includes("setAgentStatus('online')") && settings.includes('normalizeAgentDiagnostic'));
check('settings UI exposes installed printers in dropdown', settings.includes('systemPrinters.map((printer)') && settings.includes('printer.name'));
check('settings UI keeps device id in agent diagnostic', settings.includes('deviceId: diagnostic.deviceId') || settings.includes('diagnostic.deviceId'));
check('cloud proxy refuses printer list without agent device id', localAgentRoute.includes('agent_device_required') && localAgentRoute.includes('printers: []'));
check('runtime audit accepts the exact local Printer Bridge CSP allowance', auditRuntime.includes('http://127.0.0.1:4891') && auditRuntime.includes('http://localhost:4891') && auditRuntime.includes('loopbackBridgeAllowed'));
check('runtime audit rejects broad connect-src wildcard/http', auditRuntime.includes('CSP connect-src is too broad for production') && auditRuntime.includes('unexpected loopback origins'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge CSP localhost checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge CSP localhost checks passed.`);
