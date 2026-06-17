import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const installer = read('tools/agent-installer/Program.cs');
const publishScript = read('tools/release-governance/publish-windows-downloads.mjs');
const latest = JSON.parse(read('public/downloads/windows/latest.json'));

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const printerBridge = latest.files.find((file) => file.fileName === 'PrinterBridgeSetup.exe');
const fiscalBridge = latest.files.find((file) => file.fileName === 'FiscalPosBridgeSetup.exe');

check('Printer Bridge installer creates Start Menu shortcut', installer.includes('Adisyum Printer Bridge.lnk') && installer.includes('RegisterStartMenuShortcuts'));
check('Printer Bridge installer creates diagnostic Start Menu shortcut', installer.includes('Adisyum Printer Bridge Tanılama.lnk') && installer.includes('diagnose.bat'));
check('Printer Bridge installer creates optional desktop shortcut', installer.includes('DesktopDirectory') && installer.includes('Adisyum Printer Bridge.lnk'));
check('service install uses AdisyumPrinterBridge service name', installer.includes('ServiceName = "AdisyumPrinterBridge"') && installer.includes('sc.exe", "create " + ServiceName'));
check('service display name is Adisyum Printer Bridge', installer.includes('ServiceDisplayName = "Adisyum Printer Bridge"'));
check('service auto-start is configured', installer.includes('start= auto') && installer.includes('sc.exe", "start " + ServiceName'));
check('legacy desktop bridge service/task is cleaned up', installer.includes('LegacyServiceName = "AdisyumDesktopBridge"') && installer.includes('LegacyTaskName = "AdisyumDesktopBridge"'));
check('startup fallback is registered', installer.includes('schtasks.exe') && installer.includes('/SC ONLOGON') && installer.includes('CurrentVersion\\\\Run') && installer.includes('runKey.SetValue(ServiceName'));
check('ProgramData install path is correct', installer.includes('SpecialFolder.CommonApplicationData') && installer.includes('"Adisyum"') && installer.includes('"DesktopBridge"') && installer.includes('AdisyumDesktopBridge.exe'));
check('device id and logs are created under ProgramData', installer.includes('device-id.txt') && installer.includes('"logs"') && installer.includes('bridge.log'));
check('diagnose.bat is written into build install output path', installer.includes('DiagnoseScriptPath') && installer.includes('WriteDiagnosticScript') && installer.includes('File.WriteAllText(DiagnoseScriptPath'));
check('manual bridge shortcut starts run-agent mode', installer.includes('targetExe, RunArg') && installer.includes('Bridge agent listening on'));
check('diagnostic shortcut opens diagnose script', installer.includes('DiagnoseArg = "--diagnose"') && installer.includes('PrintDiagnostics()'));
check('Fiscal POS bridge is published as separate file name', fiscalBridge?.fileName === 'FiscalPosBridgeSetup.exe' && printerBridge?.fileName === 'PrinterBridgeSetup.exe');
check('Fiscal POS bridge does not override Printer Bridge display shortcut source', publishScript.includes("name: 'Fiscal POS Bridge'") && publishScript.includes("fileName: 'FiscalPosBridgeSetup.exe'") && installer.includes('Adisyum Printer Bridge'));
check('latest manifest points to PrinterBridgeSetup.exe', printerBridge?.path === '/downloads/windows/latest/PrinterBridgeSetup.exe' && printerBridge?.component === 'printer-bridge');

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Printer Bridge installer shortcut checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Printer Bridge installer shortcut checks passed.`);
