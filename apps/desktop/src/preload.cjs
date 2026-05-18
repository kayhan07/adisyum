const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adisyumDesktop', {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  saveConfig: (input) => ipcRenderer.invoke('desktop:save-config', input),
  openCloud: () => ipcRenderer.invoke('desktop:open-cloud'),
  showShell: () => ipcRenderer.invoke('desktop:show-shell'),
  bridgeHealth: () => ipcRenderer.invoke('desktop:bridge-health'),
  listPrinters: () => ipcRenderer.invoke('desktop:list-printers'),
  testPrint: (printerName) => ipcRenderer.invoke('desktop:test-print', printerName),
  fiscalStatus: () => ipcRenderer.invoke('desktop:fiscal-status'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
});
