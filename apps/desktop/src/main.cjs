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
  const resolvedBranchId = branchId || 'mrk';

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
    text: 'ADISYUM TEST PRINT',
    ticketType: 'cashier',
    dedupeKey: `desktop-test-${Date.now()}`,
  }),
}));
ipcMain.handle('desktop:fiscal-status', () => bridgeJson('/pos/status'));
ipcMain.handle('desktop:queues', () => bridgeJson('/queues'));
ipcMain.handle('desktop:updater-status', () => bridgeJson('/updater/status'));
ipcMain.handle('desktop:service-status', () => bridgeJson('/service/status'));
ipcMain.handle('desktop:open-external', (_event, url) => shell.openExternal(url));
