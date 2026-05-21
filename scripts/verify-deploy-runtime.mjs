import { spawnSync } from 'node:child_process';

const failures = [];
const liveBaseUrl = process.env.DEPLOY_VERIFY_BASE_URL || process.env.PRODUCTION_BASE_URL || '';
const verifyLive = process.env.DEPLOY_VERIFY_LIVE === '1' || liveBaseUrl.length > 0;

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (result.status !== 0) failures.push(`${command} ${args.join(' ')} failed with ${result.status}`);
}

async function verifyLiveRoute() {
  if (!verifyLive) return null;
  const base = (liveBaseUrl || 'https://adisyum.com').replace(/\/$/, '');
  const url = `${base}/api/pos/table-orders`;
  const appUrl = `${base}/app`;
  const checks = {};
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    if (response.status === 404) {
      failures.push(`${url} returned 404`);
    }
    checks.posTableOrders = { url, status: response.status, ok: response.status !== 404 };
  } catch (error) {
    failures.push(`${url} request failed: ${error instanceof Error ? error.message : String(error)}`);
    checks.posTableOrders = { url, status: null, ok: false };
  }
  try {
    const response = await fetch(appUrl, { redirect: 'manual', cache: 'no-store' });
    const location = response.headers.get('location') || '';
    if (/\b(localhost|127\.0\.0\.1)\b/i.test(location)) {
      failures.push(`${appUrl} redirects to loopback: ${location}`);
    }
    checks.appRedirect = {
      url: appUrl,
      status: response.status,
      location,
      ok: !/\b(localhost|127\.0\.0\.1)\b/i.test(location),
    };
  } catch (error) {
    failures.push(`${appUrl} redirect check failed: ${error instanceof Error ? error.message : String(error)}`);
    checks.appRedirect = { url: appUrl, status: null, location: null, ok: false };
  }
  return checks;
}

run('npm', ['run', 'routes:audit']);
run('npm', ['run', 'runtime:audit-production']);
run('npm', ['run', 'env:audit-production']);

const live = await verifyLiveRoute();
const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  live,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
