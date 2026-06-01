import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

function parseSetCookies(response) {
  const raw = response.headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;=]+=)/g).map((item) => item.trim());
}

function mergeCookieJar(current, setCookies) {
  const next = new Map(current);
  setCookies.forEach((cookie) => {
    const [pair] = cookie.split(';');
    const [name, value] = pair.split('=');
    if (!name) return;
    if (!value) {
      next.delete(name.trim());
      return;
    }
    next.set(name.trim(), value);
  });
  return next;
}

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(path, options, jar) {
  const headers = new Headers(options?.headers ?? {});
  const cookies = cookieHeader(jar);
  if (cookies) headers.set('cookie', cookies);

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: 'manual',
  });

  const updatedJar = mergeCookieJar(jar, parseSetCookies(response));
  return { response, jar: updatedJar };
}

async function loginAsTenant(tenantId, username, password, jar) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, username, password }),
  }, jar);

  assert.equal(result.response.status, 200, `Login failed for ${tenantId}`);
  return result.jar;
}

async function logout(jar) {
  const result = await request('/api/auth/session', { method: 'DELETE' }, jar);
  assert.equal(result.response.status, 200, 'Logout failed');
  return result.jar;
}

async function getSession(jar) {
  const result = await request('/api/auth/me', { method: 'GET' }, jar);
  if (result.response.status !== 200) return { ok: false, jar: result.jar };
  const payload = await result.response.json();
  return { ok: true, payload, jar: result.jar };
}

async function getRuntimeState(scope, jar) {
  const result = await request(`/api/runtime/state/${scope}`, { method: 'GET' }, jar);
  const payload = await result.response.json().catch(() => ({}));
  return { status: result.response.status, payload, jar: result.jar };
}

async function run() {
  let jar = new Map();

  jar = await loginAsTenant('TNT-TEST-0001', 'admin', '1234', jar);
  const tenantASession = await getSession(jar);
  assert.equal(tenantASession.ok, true, 'Tenant A session missing after login');
  assert.equal(tenantASession.payload.session.tenantId, 'TNT-TEST-0001');

  const tenantAState = await getRuntimeState('tenant', jar);
  assert.equal(tenantAState.status, 200, 'Tenant A runtime state unavailable');

  jar = await logout(jar);
  const afterLogoutSession = await getSession(jar);
  assert.equal(afterLogoutSession.ok, false, 'Session still active after logout');

  jar = await loginAsTenant('TNT-TEST-0001', 'admin', '1234', jar);
  const tenantBSession = await getSession(jar);
  assert.equal(tenantBSession.ok, true, 'Tenant B session missing after login');
  assert.equal(tenantBSession.payload.session.tenantId, 'TNT-TEST-0001');

  const tenantBState = await getRuntimeState('tenant', jar);
  assert.equal(tenantBState.status, 200, 'Tenant B runtime state unavailable');

  const systemAdminState = await getRuntimeState('system-admin', jar);
  assert.notEqual(systemAdminState.status, 200, 'Tenant session can access system-admin runtime scope');

  console.log('Tenant switch isolation checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
