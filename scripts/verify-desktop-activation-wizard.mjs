import { readFileSync } from 'node:fs';

const main = readFileSync('apps/desktop/src/main.cjs', 'utf8');
const preload = readFileSync('apps/desktop/src/preload.cjs', 'utf8');
const html = readFileSync('apps/desktop/src/renderer/index.html', 'utf8');
const renderer = readFileSync('apps/desktop/src/renderer/renderer.js', 'utf8');

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

check('activation shell loads when device is not activated', /if \(isActivated\(\)\)[\s\S]*mainWindow\.loadURL\(operationalUrl\(\)\)[\s\S]*else[\s\S]*mainWindow\.loadFile\(path\.join\(__dirname, 'renderer', 'index\.html'\)\)/.test(main));
check('activation requires tenant username and password', /if \(!tenantId \|\| !username \|\| !password\)/.test(main));
check('activation stores tenantId branchId cloudUrl local token and session cookie', /store\.set\(\{[\s\S]*setupCompleted: true[\s\S]*tenantId[\s\S]*branchId[\s\S]*localAuthToken[\s\S]*sessionCookie/.test(main));
check('activation form contains tenantId input', /id="tenantId"/.test(html));
check('activation form contains cloudUrl input', /id="cloudUrl"/.test(html));
check('activation form contains branchId input', /id="branchId"/.test(html));
check('activation reset button exists', /id="resetActivation"/.test(html));
check('reset activation calls preload API', /resetActivation\.addEventListener[\s\S]*api\.resetActivation/.test(renderer));
check('preload exposes resetActivation', /resetActivation:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop:reset-activation'\)/.test(preload));
check('reset activation clears local auth state', /ipcMain\.handle\('desktop:reset-activation'[\s\S]*setupCompleted: false[\s\S]*tenantId: ''[\s\S]*sessionCookie: ''/.test(main));
check('desktop menu has reactivation action', /Bu cihazi yeniden aktive et/.test(main));
check('desktop menu has local diagnostics action', /Yerel baglanti tanisini ac/.test(main));
check('reactivation menu opens activation shell', /Bu cihazi yeniden aktive et[\s\S]*loadFile\(path\.join\(__dirname, 'renderer', 'index\.html'\)\)/.test(main));
check('local diagnostics menu opens activation shell diagnostics', /Yerel baglanti tanisini ac[\s\S]*loadFile\(path\.join\(__dirname, 'renderer', 'index\.html'\)\)/.test(main));
check('activated desktop opens operational POS URL', /lastWorkspaceUrl: `\$\{origin\}\/floor`/.test(main));

if (failed > 0) {
  console.error(`\n${failed}/${passed + failed} desktop activation wizard checks failed.`);
  process.exit(1);
}

console.log(`\n${passed}/${passed} desktop activation wizard checks passed.`);
