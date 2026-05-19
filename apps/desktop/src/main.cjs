const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const ElectronStore = require('electron-store');

const Store = ElectronStore.default || ElectronStore;

const store = new Store({
  name: 'desktop-config',
  projectName: 'Adisyum Desktop',
  defaults: {
    cloudUrl: 'https://adisyum.com/app',
    bridgeUrl: 'http://127.0.0.1:4891',
    kiosk: false,
    setupCompleted: false,
    branchId: '',
  },
});

let mainWindow;

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

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function bridgeJson(route, init) {
  const response = await fetch(`${store.get('bridgeUrl')}${route}`, init);
  if (!response.ok) throw new Error(`Bridge status ${response.status}`);
  return response.json();
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
ipcMain.handle('desktop:open-cloud', () => {
  if (mainWindow) mainWindow.loadURL(store.get('cloudUrl'));
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
