const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ElectronStore = require('electron-store');

const Store = ElectronStore.default || ElectronStore;
const DEFAULT_CLOUD_URL = 'https://adisyum.com/floor';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4891';
const CLOUD_SYNC_INTERVAL_MS = 15000;

const store = new Store({
  name: 'desktop-config',
  projectName: 'Adisyum Desktop',
  defaults: {
    cloudUrl: DEFAULT_CLOUD_URL,
    bridgeUrl: DEFAULT_BRIDGE_URL,
    kiosk: false,
    setupCompleted: false,
    deviceId: '',
    tenantId: '',
    username: '',
    branchId: '',
    localAuthToken: '',
    sessionCookie: '',
    activatedAt: '',
    lastValidationAt: '',
    lastWorkspaceUrl: DEFAULT_CLOUD_URL,
    printerMappings: {},
    fiscalMappings: {},
  },
});

let mainWindow;
let bridgeProcess;
let cloudSyncTimer;
let cloudSyncInFlight = false;

function ensureDeviceId() {
  let deviceId = store.get('deviceId');
  if (!deviceId) {
    deviceId = `adisyum-${crypto.randomUUID()}`;
    store.set('deviceId', deviceId);
  }
  return deviceId;
}

function isActivated() {
  return Boolean(store.get('setupCompleted') && store.get('deviceId') && store.get('tenantId') && store.get('branchId') && store.get('sessionCookie') && store.get('localAuthToken'));
}

function cloudOrigin() {
  const configured = store.get('cloudUrl') || DEFAULT_CLOUD_URL;
  return new URL(configured).origin;
}

function operationalUrl() {
  return store.get('lastWorkspaceUrl') || store.get('cloudUrl') || DEFAULT_CLOUD_URL;
}

async function applySessionCookie() {
  const rawCookie = store.get('sessionCookie');
  if (!rawCookie) return false;

  const token = String(rawCookie).split(';')[0]?.split('=').slice(1).join('=');
  if (!token) return false;

  await session.defaultSession.cookies.set({
    url: cloudOrigin(),
    name: 'adisyum_session',
    value: decodeURIComponent(token),
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  return true;
}

function maybeStartBridge() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'AdisyumPosAgent', 'adisyum-pos-agent.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Adisyum', 'DesktopBridge', 'AdisyumPosAgent.exe'),
  ].filter(Boolean);

  const target = candidates.find((candidate) => fs.existsSync(candidate));
  if (!target || bridgeProcess) return Boolean(target);

  bridgeProcess = spawn(target, ['--run-agent'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: path.dirname(target),
  });
  bridgeProcess.unref();
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#08111f',
    fullscreen: Boolean(store.get('kiosk')),
    kiosk: Boolean(store.get('kiosk')),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ensureDeviceId();
  maybeStartBridge();

  if (isActivated()) {
    startCloudBridgeSync();
    applySessionCookie()
      .catch(() => false)
      .finally(() => mainWindow.loadURL(operationalUrl()));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }
}

async function bridgeJson(route, init) {
  const response = await fetch(`${store.get('bridgeUrl')}${route}`, init);
  if (!response.ok) throw new Error(`Bridge status ${response.status}`);
  return response.json();
}

function cloudDeviceHeaders() {
  const sessionCookie = String(store.get('sessionCookie') || '').split(';')[0];
  return {
    'content-type': 'application/json',
    cookie: sessionCookie,
    'user-agent': `AdisyumDesktop/${app.getVersion()}`,
    'x-adisyum-tenant-id': String(store.get('tenantId') || ''),
    'x-adisyum-device-id': ensureDeviceId(),
    'x-adisyum-device-token': String(store.get('localAuthToken') || ''),
  };
}

async function cloudJson(route, init = {}) {
  const response = await fetch(`${cloudOrigin()}${route}`, {
    ...init,
    headers: {
      ...cloudDeviceHeaders(),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Cloud status ${response.status}`);
  }
  return payload;
}

async function fetchActivatedSession(origin, setCookie) {
  const response = await fetch(`${origin}/api/auth/me`, {
    headers: {
      cookie: setCookie.split(';')[0],
      'user-agent': `AdisyumDesktop/${app.getVersion()}`,
    },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function stablePrinterId(printer) {
  return `printer-${crypto.createHash('sha256')
    .update([printer.name, printer.portName, printer.driverName].join('|').toLowerCase())
    .digest('hex')
    .slice(0, 20)}`;
}

function normalizeBridgePrinters(printers) {
  if (!Array.isArray(printers)) return [];
  return printers
    .map((printer) => {
      if (typeof printer === 'string') return { name: printer.trim() };
      return {
        name: String(printer?.name || printer?.Name || '').trim(),
        driverName: String(printer?.driverName || printer?.DriverName || ''),
        portName: String(printer?.portName || printer?.PortName || ''),
        status: String(printer?.status || printer?.PrinterStatus || ''),
        shared: Boolean(printer?.shared ?? printer?.Shared ?? false),
        online: printer?.online !== false,
        connectionType: printer?.connectionType || 'windows',
        default: Boolean(printer?.default ?? printer?.Default ?? false),
        escpos: printer?.escpos !== false,
      };
    })
    .filter((printer) => printer.name)
    .map((printer) => ({ ...printer, printerId: stablePrinterId(printer) }));
}

async function syncCloudPrinterRegistry() {
  const health = await bridgeJson('/health');
  const printers = normalizeBridgePrinters(health?.printers ?? await bridgeJson('/printers'));
  await cloudJson('/api/devices/registry', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: store.get('tenantId'),
      deviceId: ensureDeviceId(),
      branchId: store.get('branchId'),
      hostname: os.hostname(),
      bridgeVersion: health?.version || app.getVersion(),
      deviceToken: store.get('localAuthToken'),
      printers,
      queueDepth: Number(health?.queueCount || 0),
      spoolerHealth: String(health?.spooler?.status || 'unknown'),
      metadata: {
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        cachedPrinterInventory: Boolean(health?.cached),
        lastError: health?.error || null,
      },
    }),
  });
}

async function updateCloudPrintJob(jobId, status, error) {
  await cloudJson('/api/printers/print-requests', {
    method: 'PATCH',
    body: JSON.stringify({ jobId, deviceId: ensureDeviceId(), status, error }),
  });
}

async function processCloudPrintJobs() {
  const payload = await cloudJson(`/api/printers/print-requests?deviceId=${encodeURIComponent(ensureDeviceId())}`);
  for (const job of (payload?.jobs || []).slice(0, 10)) {
    try {
      await updateCloudPrintJob(job.id, 'printing');
      await bridgeJson('/print', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          printerName: job.printerName,
          bytesBase64: job.payload?.bytesBase64,
          mode: 'raw',
          source: `proxy:${job.source || 'cloud'}`,
        }),
      });
      await updateCloudPrintJob(job.id, 'printed');
    } catch (error) {
      await updateCloudPrintJob(job.id, 'failed', error instanceof Error ? error.message : String(error)).catch(() => undefined);
    }
  }
}

async function runCloudBridgeCycle() {
  if (!isActivated() || cloudSyncInFlight) return;
  cloudSyncInFlight = true;
  try {
    await syncCloudPrinterRegistry();
    await processCloudPrintJobs();
  } catch (error) {
    console.warn('[adisyum-desktop] CLOUD_BRIDGE_SYNC_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cloudSyncInFlight = false;
  }
}

function startCloudBridgeSync() {
  if (cloudSyncTimer) clearInterval(cloudSyncTimer);
  void runCloudBridgeCycle();
  cloudSyncTimer = setInterval(() => void runCloudBridgeCycle(), CLOUD_SYNC_INTERVAL_MS);
}

function buildRawTestReceipt() {
  const lines = [
    '\x1B@',
    '\x1Ba\x01',
    '\x1BE\x01ADISYUM TEST PRINT\x1BE\x00',
    '\x1Ba\x00',
    `Device: ${ensureDeviceId()}`,
    `Time: ${new Date().toISOString()}`,
    '',
    'Printer bridge OK',
    '\n\n\n',
    '\x1DV\x00',
  ];
  return Buffer.from(lines.join('\n'), 'utf8').toString('base64');
}

async function activateDevice(input) {
  const tenantId = String(input?.tenantId || '').trim();
  const username = String(input?.username || '').trim();
  const password = String(input?.password || '');
  const branchId = String(input?.branchId || '').trim();
  const cloudUrl = String(input?.cloudUrl || DEFAULT_CLOUD_URL).trim() || DEFAULT_CLOUD_URL;
  const bridgeUrl = String(input?.bridgeUrl || DEFAULT_BRIDGE_URL).trim() || DEFAULT_BRIDGE_URL;

  if (!tenantId || !username || !password) {
    throw new Error('Abone no, kullanıcı adı ve şifre zorunludur.');
  }

  store.set({ cloudUrl, bridgeUrl, kiosk: Boolean(input?.kiosk) });
  const origin = new URL(cloudUrl).origin;
  const loginResponse = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `AdisyumDesktop/${app.getVersion()}` },
    body: JSON.stringify({ tenantId, username, password }),
  });

  if (!loginResponse.ok) {
    const failure = await loginResponse.json().catch(() => null);
    throw new Error(failure?.error || `Cloud aktivasyon başarısız: ${loginResponse.status}`);
  }

  const setCookie = loginResponse.headers.get('set-cookie');
  if (!setCookie || !setCookie.includes('adisyum_session=')) {
    throw new Error('Cloud oturum çerezi alınamadı.');
  }

  const now = new Date().toISOString();
  const deviceId = ensureDeviceId();
  const localAuthToken = crypto.randomBytes(32).toString('base64url');
  const sessionPayload = await fetchActivatedSession(origin, setCookie);
  const sessionBranchId = typeof sessionPayload?.session?.branchId === 'string'
    ? sessionPayload.session.branchId.trim()
    : '';
  const resolvedBranchId = branchId || sessionBranchId || 'mrk';

  store.set({
    setupCompleted: true,
    deviceId,
    tenantId,
    username,
    branchId: resolvedBranchId,
    localAuthToken,
    sessionCookie: setCookie,
    activatedAt: store.get('activatedAt') || now,
    lastValidationAt: now,
    lastWorkspaceUrl: `${origin}/floor`,
  });

  await applySessionCookie();

  fetch(`${origin}/api/pos/device`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: setCookie.split(';')[0],
      'user-agent': `AdisyumDesktop/${app.getVersion()}`,
    },
    body: JSON.stringify({
      id: deviceId,
      tenantId,
      branchId: resolvedBranchId,
      name: os.hostname(),
      type: 'windows-desktop',
      status: 'online',
      metadata: {
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        activatedAt: now,
      },
    }),
  }).catch(() => undefined);

  maybeStartBridge();
  startCloudBridgeSync();
  return {
    ok: true,
    deviceId,
    tenantId,
    branchId: resolvedBranchId,
    cloudUrl: `${origin}/floor`,
    bridgeStarted: Boolean(bridgeProcess),
  };
}

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:get-config', () => store.store);
ipcMain.handle('desktop:save-config', (_event, input) => {
  store.set(input);
  return store.store;
});
ipcMain.handle('desktop:activate', (_event, input) => activateDevice(input));
ipcMain.handle('desktop:reset-activation', async () => {
  if (cloudSyncTimer) clearInterval(cloudSyncTimer);
  cloudSyncTimer = undefined;
  store.set({
    setupCompleted: false,
    tenantId: '',
    username: '',
    branchId: '',
    localAuthToken: '',
    sessionCookie: '',
    lastValidationAt: '',
  });
  await session.defaultSession.cookies.remove(cloudOrigin(), 'adisyum_session').catch(() => undefined);
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return { ok: true };
});
ipcMain.handle('desktop:open-cloud', () => {
  if (mainWindow) {
    applySessionCookie()
      .catch(() => false)
      .finally(() => mainWindow.loadURL(operationalUrl()));
  }
});
ipcMain.handle('desktop:show-shell', () => {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
ipcMain.handle('desktop:bridge-health', () => bridgeJson('/health'));
ipcMain.handle('desktop:list-printers', () => bridgeJson('/printers'));
ipcMain.handle('desktop:test-print', (_event, printerName) => bridgeJson('/print', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    printerName,
    bytesBase64: buildRawTestReceipt(),
    mode: 'raw',
    source: 'standard-mode-test',
  }),
}));
ipcMain.handle('desktop:fiscal-status', () => bridgeJson('/pos/status'));
ipcMain.handle('desktop:queues', () => bridgeJson('/queues'));
ipcMain.handle('desktop:updater-status', () => bridgeJson('/updater/status'));
ipcMain.handle('desktop:service-status', () => bridgeJson('/service/status'));
ipcMain.handle('desktop:open-external', (_event, url) => shell.openExternal(url));
