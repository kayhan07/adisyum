import { readFileSync } from 'node:fs';

const program = readFileSync('tools/agent-installer/Program.cs', 'utf8');
const desktopPackage = readFileSync('apps/desktop/package.json', 'utf8');

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

check('Printer Bridge uninstall arg is supported', /UninstallArg\s*=\s*"--uninstall"/.test(program));
check('Printer Bridge uninstall registry key is written', /RegisterUninstallEntry\("AdisyumPrinterBridge",\s*ServiceDisplayName/.test(program));
check('Fiscal POS Bridge uninstall registry key is written', /RegisterUninstallEntry\("AdisyumFiscalPosBridge",\s*FiscalDisplayName/.test(program));
check('Printer Bridge display name is correct', /ServiceDisplayName\s*=\s*"Adisyum Printer Bridge"/.test(program));
check('Fiscal POS Bridge display name is correct', /FiscalDisplayName\s*=\s*"Adisyum Fiscal POS Bridge"/.test(program));
check('Publisher is Adisyum', /SetValue\("Publisher",\s*"Adisyum"/.test(program));
check('DisplayVersion uses bridge version', /SetValue\("DisplayVersion",\s*BridgeVersion/.test(program));
check('InstallLocation is written', /SetValue\("InstallLocation",\s*installDir/.test(program));
check('UninstallString points to target exe uninstall arg', /SetValue\("UninstallString",\s*uninstall/.test(program));
check('QuietUninstallString is written', /SetValue\("QuietUninstallString"/.test(program));
check('EstimatedSize is written', /SetValue\("EstimatedSize"/.test(program));
check('HKLM falls back to HKCU for non-admin install', /Registry\.LocalMachine\.CreateSubKey[\s\S]*catch[\s\S]*Registry\.CurrentUser\.CreateSubKey/.test(program));
check('Uninstall removes service and startup task', /UninstallAgent[\s\S]*sc\.exe", "stop " \+ ServiceName[\s\S]*schtasks\.exe", "\/Delete/.test(program));
check('Uninstall removes registry entries', /DeleteUninstallEntry\("AdisyumPrinterBridge"\)[\s\S]*DeleteUninstallEntry\("AdisyumFiscalPosBridge"\)/.test(program));
check('Desktop installer remains a separate Add Remove Programs app', /"productName":\s*"Adisyum Desktop"/.test(desktopPackage));
check('Desktop installer creates Start Menu shortcut', /"createStartMenuShortcut":\s*true/.test(desktopPackage));

if (failed > 0) {
  console.error(`\n${failed}/${passed + failed} Windows uninstall registry checks failed.`);
  process.exit(1);
}

console.log(`\n${passed}/${passed} Windows uninstall registry checks passed.`);
