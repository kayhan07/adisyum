const api = window.adisyumDesktop;

function write(target, payload) {
  target.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

async function hydrate() {
  const config = await api.getConfig();
  cloudUrl.value = config.cloudUrl || 'https://adisyum.com/floor';
  bridgeUrl.value = config.bridgeUrl || 'http://127.0.0.1:4891';
  kiosk.checked = Boolean(config.kiosk);
  tenantId.value = config.tenantId || '';
  username.value = config.username || '';
  branchId.value = config.branchId || '';
  deviceBadge.textContent = config.deviceId ? `Cihaz: ${config.deviceId}` : 'Yeni cihaz';

  if (config.setupCompleted && config.deviceId && config.tenantId) {
    write(activationResult, {
      ok: true,
      message: 'Bu cihaz aktive edilmiş. POS doğrudan operasyon ekranına açılır.',
      tenantId: config.tenantId,
      branchId: config.branchId,
      lastValidationAt: config.lastValidationAt,
    });
  }
}

activateDevice.addEventListener('click', async () => {
  activateDevice.disabled = true;
  write(activationResult, 'Aktivasyon doğrulanıyor...');
  try {
    const result = await api.activate({
      tenantId: tenantId.value.trim(),
      username: username.value.trim(),
      password: password.value,
      branchId: branchId.value.trim(),
      cloudUrl: cloudUrl.value.trim(),
      bridgeUrl: bridgeUrl.value.trim(),
      kiosk: kiosk.checked,
    });
    write(activationResult, result);
    await api.openCloud();
  } catch (error) {
    write(activationResult, { ok: false, error: error.message });
  } finally {
    activateDevice.disabled = false;
  }
});

resetActivation.addEventListener('click', async () => {
  await api.resetActivation();
  await hydrate();
});

openPos.addEventListener('click', () => api.openCloud());
downloadPrinterBridge.addEventListener('click', () => api.openExternal('https://adisyum.com/downloads/windows/latest/PrinterBridgeSetup.exe?v=windows-1781695779253'));
downloadFiscalBridge.addEventListener('click', () => api.openExternal('https://adisyum.com/downloads/windows/latest/FiscalPosBridgeSetup.exe?v=windows-1781695779253'));

scanPrinters.addEventListener('click', async () => {
  printerList.innerHTML = '';
  write(supportResult, 'Yazıcılar taranıyor...');
  const printers = await api.listPrinters().catch((error) => ({ ok: false, error: error.message }));
  if (!Array.isArray(printers)) {
    write(supportResult, printers);
    return;
  }

  const health = await api.bridgeHealth().catch((error) => ({ ok: false, error: error.message }));
  if (printers.length === 0) {
    write(supportResult, {
      ok: false,
      message: 'Yazıcı bulunamadı. Print Spooler, bridge ve keşif yöntemleri aşağıda görünüyor.',
      count: 0,
      spooler: health?.spooler,
      diagnostics: health?.diagnostics,
      bridgeError: health?.error,
    });
    return;
  }

  write(supportResult, {
    ok: true,
    count: printers.length,
    bridge: health?.service || 'adisyum-pos-agent',
    spooler: health?.spooler,
    printers,
  });

  for (const printer of printers) {
    const name = typeof printer === 'string' ? printer : printer.Name || printer.name;
    const meta = typeof printer === 'string'
      ? ''
      : [
          printer.default ? 'Varsayılan' : '',
          printer.online === false ? 'Offline' : 'Online',
          printer.connectionType || '',
          printer.escpos ? 'ESC/POS aday' : '',
          printer.portName || '',
        ].filter(Boolean).join(' / ');
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span><strong>${name}</strong><small>${meta}</small></span><button>Test yazdır</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      const result = await api.testPrint(name).catch((error) => ({ ok: false, error: error.message }));
      write(supportResult, result);
    });
    printerList.appendChild(row);
  }
});

async function showSupport(work) {
  write(supportResult, await work().catch((error) => ({ ok: false, error: error.message })));
}

checkBridge.addEventListener('click', () => showSupport(() => api.bridgeHealth()));
checkFiscal.addEventListener('click', () => showSupport(() => api.fiscalStatus()));
supportQueues.addEventListener('click', () => showSupport(() => api.queues()));
supportUpdater.addEventListener('click', () => showSupport(() => api.updaterStatus()));
supportService.addEventListener('click', () => showSupport(() => api.serviceStatus()));
exportDiagnostics.addEventListener('click', async () => {
  const [health, queues, fiscal, service, updater] = await Promise.all([
    api.bridgeHealth().catch((error) => ({ ok: false, error: error.message })),
    api.queues().catch((error) => ({ ok: false, error: error.message })),
    api.fiscalStatus().catch((error) => ({ ok: false, error: error.message })),
    api.serviceStatus().catch((error) => ({ ok: false, error: error.message })),
    api.updaterStatus().catch((error) => ({ ok: false, error: error.message })),
  ]);
  write(supportResult, { exportedAt: new Date().toISOString(), health, queues, fiscal, service, updater });
});

void hydrate();
