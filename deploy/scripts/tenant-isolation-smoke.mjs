const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function createSession(tenantId) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: `smoke-${tenantId}`,
      tenantId,
      role: 'Admin',
      subscriptionId: tenantId,
      permissions: ['*'],
      packageType: 'premium',
      branchId: 'mrk',
    }),
  });

  if (!response.ok) {
    throw new Error(`Session create failed for ${tenantId}: HTTP ${response.status}`);
  }

  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`Session cookie missing for ${tenantId}`);
  return cookie;
}

async function request(path, cookie, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      cookie,
      origin: baseUrl,
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

const tenantA = await createSession('SMOKE-A');
const tenantB = await createSession('SMOKE-B');

await request('/api/runtime/table-state', tenantA, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    paymentRequestedTableIds: ['A-1'],
    liveTotals: { 'A-1': 123 },
    ordersByTable: { 'A-1': [{ id: 'order-a' }] },
    tableMeta: { 'A-1': { name: 'Tenant A Table' } },
  }),
});

const tenantBState = await request('/api/runtime/table-state', tenantB);
if (tenantBState.state.paymentRequestedTableIds.includes('A-1')) {
  throw new Error('Tenant B can see Tenant A table-state data.');
}

await request('/api/pos/mapping', tenantA, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    product_id: 'tenant-a-product',
    product_name: 'Tenant A Product',
    pos_plu_code: 'A001',
    vat_rate: 10,
    unit_type: 'adet',
  }),
});

const tenantBMapping = await request('/api/v1/products/tenant-a-product/mapping', tenantB);
if (tenantBMapping.is_mapped) {
  throw new Error('Tenant B can see Tenant A POS mapping data.');
}

console.log('Tenant isolation smoke test passed.');
