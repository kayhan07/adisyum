const api = window.adisyumDesktop;
const panels = [...document.querySelectorAll('.panel')];
const stepButtons = [...document.querySelectorAll('[data-step]')];

function showStep(id) {
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === id));
  stepButtons.forEach((button) => button.classList.toggle('active', button.dataset.step === id));
}

stepButtons.forEach((button) => button.addEventListener('click', () => showStep(button.dataset.step)));

async function hydrate() {
  const config = await api.getConfig();
  cloudUrl.value = config.cloudUrl;
  bridgeUrl.value = config.bridgeUrl;
  kiosk.checked = Boolean(config.kiosk);
  branchId.value = config.branchId || '';
}

saveConfig.addEventListener('click', async () => {
  await api.saveConfig({
    cloudUrl: cloudUrl.value.trim(),
    bridgeUrl: bridgeUrl.value.trim(),
    kiosk: kiosk.checked,
    branchId: branchId.value.trim(),
  });
  showStep('branch');
});

scanPrinters.addEventListener('click', async () => {
  printerList.innerHTML = '';
  const printers = await api.listPrinters().catch(() => []);
  for (const printer of printers) {
    const name = typeof printer === 'string' ? printer : printer.Name || printer.name;
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<span>${name}</span><button>Test yazdır</button>`;
    row.querySelector('button').addEventListener('click', () => api.testPrint(name));
    printerList.appendChild(row);
  }
});

checkFiscal.addEventListener('click', async () => {
  fiscalResult.textContent = JSON.stringify(await api.fiscalStatus().catch((error) => ({ ok: false, error: error.message })), null, 2);
});

checkBridge.addEventListener('click', async () => {
  healthResult.textContent = JSON.stringify(await api.bridgeHealth().catch((error) => ({ ok: false, error: error.message })), null, 2);
});

openPos.addEventListener('click', async () => {
  await api.saveConfig({ setupCompleted: true });
  await api.openCloud();
});

void hydrate();
