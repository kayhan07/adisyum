import { readFileSync } from 'node:fs';

const main = readFileSync('apps/desktop/src/main.cjs', 'utf8');
const preload = readFileSync('apps/desktop/src/preload.cjs', 'utf8');
const localAgent = readFileSync('lib/local-agent.ts', 'utf8');
const provider = readFileSync('components/providers/app-runtime-provider.tsx', 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

check('preload exposes adisyumLocalAgent bridge', /exposeInMainWorld\('adisyumLocalAgent'/.test(preload));
check('preload exposes getLocalPrinterHealth', /getLocalPrinterHealth:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop:bridge-health'\)/.test(preload));
check('preload exposes getInstalledPrinters', /getInstalledPrinters:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop:list-printers'\)/.test(preload));
check('preload exposes generic local agent request', /request:\s*\(route,\s*options\)\s*=>\s*ipcRenderer\.invoke\('desktop:local-agent-request'/.test(preload));
check('preload exposes registerPrinterRole', /registerPrinterRole:\s*\(input\)\s*=>\s*ipcRenderer\.invoke\('desktop:register-printer-role'/.test(preload));
check('main handles desktop local agent request through bridgeRequest', /ipcMain\.handle\('desktop:local-agent-request'[\s\S]*bridgeRequest/.test(main));
check('main local agent request can forward method headers and body', /async function bridgeRequest[\s\S]*options\.method[\s\S]*JSON\.stringify\(options\.body\)/.test(main));
check('web helper declares adisyumLocalAgent global', /adisyumLocalAgent\?: unknown/.test(localAgent));
check('web helper tries desktop preload before browser loopback fetch', /fetchViaDesktopPreload[\s\S]*if \(desktopResult\)[\s\S]*isLocalBridgeBrowserRuntimeEnabled/.test(localAgent));
check('desktop preload result is converted to JSON Response compatible with existing UI', /new Response\(JSON\.stringify\(payload/.test(localAgent));
check('desktop health uses preload getLocalPrinterHealth fallback', /path === '\/health'[\s\S]*getLocalPrinterHealth/.test(localAgent));
check('desktop printers uses preload getInstalledPrinters fallback', /path === '\/printers'[\s\S]*getInstalledPrinters/.test(localAgent));
check('Chrome direct fetch fallback remains enabled', /fetchDirectLocalAgent\(path/.test(localAgent));
check('targetAddressSpace is not required in desktop preload path', /fetchViaDesktopPreload[\s\S]*return null;[\s\S]*async function fetchDirectLocalAgent/.test(localAgent));
check('runtime heartbeat skips direct browser local fetch inside desktop shell', /window\.adisyumLocalAgent[\s\S]*return;[\s\S]*getLocalBridgeHealthUrl/.test(provider));

if (failed > 0) {
  console.error(`\n${failed}/${passed + failed} desktop local agent preload bridge checks failed.`);
  process.exit(1);
}

console.log(`\n${passed}/${passed} desktop local agent preload bridge checks passed.`);
