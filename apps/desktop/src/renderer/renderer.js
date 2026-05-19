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

scanPrinters.addEventListener('click', async () => {
  printerList.innerHTML = '';
  const printers = await api.listPrinters().catch((error) => ({ ok: false, error: error.message }));
  if (!Array.isArray(printers)) {
    write(supportResult, printers);
    return;
  }
  for (const printer of printers) {
    const name = typeof printer === 'string' ? printer : printer.Name || printer.name;
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span>${name}</span><button>Test yazdır</button>`;
    row.querySelector('button').addEventListener('click', () => api.testPrint(name));
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
