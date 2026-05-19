import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.join(repoRoot, 'apps', 'desktop');
const desktopReleaseDir = path.join(desktopRoot, 'release');
const windowsDownloadsRoot = path.join(repoRoot, 'public', 'downloads', 'windows');
const websiteWindowsDownloadsRoot = path.join(repoRoot, 'apps', 'website', 'public', 'downloads', 'windows');
const minInstallerBytes = 10 * 1024 * 1024;
const minBridgeBytes = 100 * 1024;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function assertPeExecutable(filePath, minBytes) {
  if (!existsSync(filePath)) throw new Error(`Missing artifact: ${filePath}`);
  const stat = statSync(filePath);
  if (stat.size < minBytes) {
    throw new Error(`Artifact is too small to be a production installer: ${filePath} (${stat.size} bytes)`);
  }

  const handle = openSync(filePath, 'r');
  const signature = Buffer.alloc(2);
  try {
    readSync(handle, signature, 0, 2, 0);
  } finally {
    closeSync(handle);
  }

  if (signature.toString('ascii') !== 'MZ') {
    throw new Error(`Artifact is not a Windows PE executable: ${filePath}`);
  }

  return stat;
}

function findDesktopInstaller() {
  const explicit = path.join(desktopReleaseDir, 'AdisyumDesktopSetup.exe');
  if (existsSync(explicit)) return explicit;

  const candidates = readdirSync(desktopReleaseDir)
    .filter((file) => file.toLowerCase().endsWith('.exe') && !file.toLowerCase().includes('uninstaller'))
    .map((file) => path.join(desktopReleaseDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No Electron installer found in ${desktopReleaseDir}. Run npm --prefix apps/desktop run dist first.`);
  }

  return candidates[0];
}

function findBridgeInstaller() {
  if (process.env.BRIDGE_INSTALLER_SOURCE) return path.resolve(process.env.BRIDGE_INSTALLER_SOURCE);

  const candidates = [
    path.join(repoRoot, 'tools', 'agent-installer', 'publish', 'adisyum-pos-agent.exe'),
    path.join(repoRoot, 'tools', 'agent-installer', 'bin', 'Release', 'netcoreapp3.1', 'win-x64', 'publish', 'adisyum-pos-agent.exe'),
    path.join(repoRoot, 'tools', 'agent-installer', 'bin', 'Release', 'netcoreapp3.1', 'publish', 'adisyum-pos-agent.exe'),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Bridge installer not found. Run: dotnet publish tools/agent-installer/AdisyumPosAgentInstaller.csproj -c Release -r win-x64 --self-contained false -o tools/agent-installer/publish',
    );
  }

  return found;
}

function copyTreeArtifacts(root, files, manifest) {
  const latestDir = path.join(root, 'latest');
  const versionDir = path.join(root, `v${manifest.version}`);
  mkdirSync(latestDir, { recursive: true });
  mkdirSync(versionDir, { recursive: true });

  for (const file of files) {
    const latestTarget = path.join(latestDir, file.fileName);
    const versionTarget = path.join(versionDir, file.fileName);
    copyFileSync(file.sourcePath, latestTarget);
    copyFileSync(file.sourcePath, versionTarget);
  }

  writeFileSync(path.join(root, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(latestDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(versionDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const desktopPackage = readJson(path.join(desktopRoot, 'package.json'));
const rootPackage = readJson(path.join(repoRoot, 'package.json'));
const version = process.env.ADISYUM_WINDOWS_VERSION || desktopPackage.version || '1.0.0';
const buildId = process.env.ADISYUM_BUILD_ID || `windows-${Date.now()}`;
const releasedAt = new Date().toISOString();
const desktopInstaller = findDesktopInstaller();
const bridgeInstaller = findBridgeInstaller();

const desktopStat = assertPeExecutable(desktopInstaller, minInstallerBytes);
const bridgeStat = assertPeExecutable(bridgeInstaller, minBridgeBytes);

const files = [
  {
    name: 'Adisyum Desktop',
    fileName: 'AdisyumDesktopSetup.exe',
    sourcePath: desktopInstaller,
    sha256: sha256(desktopInstaller),
    sizeBytes: desktopStat.size,
    mandatory: false,
    component: 'desktop',
  },
  {
    name: 'Printer Bridge',
    fileName: 'PrinterBridgeSetup.exe',
    sourcePath: bridgeInstaller,
    sha256: sha256(bridgeInstaller),
    sizeBytes: bridgeStat.size,
    mandatory: false,
    component: 'printer-bridge',
  },
  {
    name: 'Fiscal POS Bridge',
    fileName: 'FiscalPosBridgeSetup.exe',
    sourcePath: bridgeInstaller,
    sha256: sha256(bridgeInstaller),
    sizeBytes: bridgeStat.size,
    mandatory: false,
    component: 'fiscal-pos-bridge',
  },
];

const manifest = {
  version,
  buildId,
  releasedAt,
  mandatory: false,
  channel: 'latest',
  appVersion: rootPackage.version,
  baseUrl: 'https://adisyum.com/downloads/windows/latest',
  autoUpdate: {
    provider: 'generic',
    url: 'https://adisyum.com/downloads/windows/latest/',
    stagedRollout: false,
  },
  files: files.map(({ sourcePath: _sourcePath, ...file }) => ({
    ...file,
    path: `/downloads/windows/latest/${file.fileName}`,
    versionedPath: `/downloads/windows/v${version}/${file.fileName}`,
  })),
};

copyTreeArtifacts(windowsDownloadsRoot, files, manifest);
if (existsSync(websiteWindowsDownloadsRoot)) {
  copyTreeArtifacts(websiteWindowsDownloadsRoot, files, manifest);
}

console.log(JSON.stringify({
  ok: true,
  version,
  buildId,
  publishedTo: [
    windowsDownloadsRoot,
    existsSync(websiteWindowsDownloadsRoot) ? websiteWindowsDownloadsRoot : null,
  ].filter(Boolean),
  files: manifest.files.map((file) => ({
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  })),
}, null, 2));
