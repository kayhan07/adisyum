import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

const latest = readJson('public/downloads/windows/latest.json');
const websiteLatest = readJson('apps/website/public/downloads/windows/latest.json');
const desktopSupport = read('components/desktop-support-center.tsx');
const publishScript = read('tools/release-governance/publish-windows-downloads.mjs');
const desktopPackage = readJson('apps/desktop/package.json');
const bridgeProgram = read('tools/agent-installer/Program.cs');

const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const filesByName = new Map(latest.files.map((file) => [file.fileName, file]));
const websiteFilesByName = new Map(websiteLatest.files.map((file) => [file.fileName, file]));
const buildId = latest.buildId;
const bridgeVersion = bridgeProgram.match(/BridgeVersion\s*=\s*"([^"]+)"/)?.[1] ?? null;

check('latest manifest has current Windows build id shape', /^windows-\d+$/.test(buildId));
check('website latest manifest matches app latest build id', websiteLatest.buildId === buildId);
check('Desktop package version is 0.1.7', desktopPackage.version === '0.1.7');
check('Printer Bridge code version is 0.1.7', bridgeVersion === '0.1.7');
check('release-wide manifest version is 0.1.7', latest.version === '0.1.7' && websiteLatest.version === '0.1.7');
check('Adisyum Desktop file version is 0.1.7', filesByName.get('AdisyumDesktopSetup.exe')?.version === '0.1.7');
check('Printer Bridge file version is 0.1.7', filesByName.get('PrinterBridgeSetup.exe')?.version === '0.1.7');
check('Fiscal POS Bridge file version is 0.1.7', filesByName.get('FiscalPosBridgeSetup.exe')?.version === '0.1.7');
check('website manifest keeps package-specific versions', ['AdisyumDesktopSetup.exe', 'PrinterBridgeSetup.exe', 'FiscalPosBridgeSetup.exe'].every((fileName) => websiteFilesByName.get(fileName)?.version === '0.1.7'));
check('download paths use v0.1.7 versioned directory', latest.files.every((file) => file.versionedPath?.includes('/downloads/windows/v0.1.7/')));
check('UI has no hardcoded v0.1.6 label or path', !/v0\.1\.6|0\.1\.6/.test(desktopSupport));
check('UI download links use current build id cache buster', desktopSupport.includes(buildId) && desktopSupport.includes('?v=${latestBuildId}'));
check('UI renders package-specific item version', desktopSupport.includes('const itemVersion = item.version ?? releaseVersion') && desktopSupport.includes('v{itemVersion}'));
check('UI shows short and full build id', desktopSupport.includes('Build: {shortBuildId}') && desktopSupport.includes('Tam buildId: {releaseBuildId}'));
check('UI still displays sha and build chip on cards', desktopSupport.includes('sha {item.sha256.slice(0, 8)}') && desktopSupport.includes('build {shortBuildId}'));
check('publish script writes package-specific file versions', publishScript.includes('version: bridgeVersion') && publishScript.includes('readBridgeVersion()') && publishScript.includes('versionedPath: `/downloads/windows/v${version}/${file.fileName}`'));

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} Windows download version metadata checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} Windows download version metadata checks passed.`);
