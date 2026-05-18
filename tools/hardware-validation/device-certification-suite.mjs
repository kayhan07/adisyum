#!/usr/bin/env node

const baseUrl = process.env.BRIDGE_URL || 'http://127.0.0.1:4891';
const tenantId = process.env.TENANT_ID || 'hardware-certification-tenant';
const printerName = process.env.PRINTER_NAME || 'validation-printer';

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && payload.ok !== false, status: response.status, payload };
}

async function main() {
  const turkishSample = 'ç Ç ğ Ğ ı I İ i ö Ö ş Ş ü Ü';
  const health = await request('/health');
  const printers = await request('/printers');
  const escpos = await request('/escpos/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: turkishSample, cut: true, openDrawer: false }),
  });
  const drawer = await request('/drawer/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, printerName }),
  });
  const fiscal = await request('/pos/status');
  const queues = await request('/queues');

  const checks = {
    bridgeHealth: health.ok,
    printerDiscovery: printers.ok,
    escposTurkishRender: escpos.ok && escpos.payload?.encoding,
    drawerPulse: drawer.ok,
    fiscalBoundary: fiscal.ok,
    queueVisibility: queues.ok,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 100);

  console.log(JSON.stringify({
    ok: score >= 80,
    baseUrl,
    tenantId,
    printerName,
    score,
    checks,
    generatedAt: new Date().toISOString(),
  }, null, 2));
  process.exit(score >= 80 ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
