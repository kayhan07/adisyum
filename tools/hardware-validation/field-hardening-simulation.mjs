#!/usr/bin/env node

const baseUrl = process.env.BRIDGE_URL || 'http://127.0.0.1:4891';
const tenantId = process.env.TENANT_ID || 'field-hardening-tenant';

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && payload.ok !== false, payload };
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return response.json();
}

async function main() {
  const mutationId = `chaos-${Date.now()}`;
  const duplicateSync = await Promise.all([
    post('/sync/enqueue', { tenantId, type: 'order.snapshot', mutationId, requestId: mutationId, bodyJson: '{"order":"A"}' }),
    post('/sync/enqueue', { tenantId, type: 'order.snapshot', mutationId, requestId: mutationId, bodyJson: '{"order":"A"}' }),
  ]);
  const duplicateFiscal = await Promise.all([
    post('/pos/transaction', { tenantId, transactionId: mutationId, mutationId, bodyJson: '{"amount":100}' }),
    post('/pos/transaction', { tenantId, transactionId: mutationId, mutationId, bodyJson: '{"amount":100}' }),
  ]);
  const queues = await get('/queues');
  console.log(JSON.stringify({
    ok: true,
    tenantId,
    duplicateSync,
    duplicateFiscal,
    queues,
    generatedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
