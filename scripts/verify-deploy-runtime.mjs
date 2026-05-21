import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const failures = [];
const liveBaseUrl = process.env.DEPLOY_VERIFY_BASE_URL || process.env.PRODUCTION_BASE_URL || '';
const verifyLive = process.env.DEPLOY_VERIFY_LIVE === '1' || liveBaseUrl.length > 0;
const expectedCommit = process.env.DEPLOY_VERIFY_GIT_COMMIT || gitCommit();
const expectedBuildId = process.env.DEPLOY_VERIFY_BUILD_ID || readBuildId();

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function readBuildId() {
  try {
    return fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
  } catch {
    return '';
  }
}

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
  const buildUrl = `${base}/api/runtime-build-id`;
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
    const response = await fetch(buildUrl, { cache: 'no-store' });
    if (response.status === 404) failures.push(`${buildUrl} returned 404`);
    const body = await response.json().catch(() => null);
    if (expectedBuildId && body?.buildId !== expectedBuildId) {
      failures.push(`${buildUrl} BUILD_ID mismatch: live=${body?.buildId ?? 'missing'} expected=${expectedBuildId}`);
    }
    if (expectedCommit && !String(body?.gitCommit ?? '').startsWith(expectedCommit)) {
      failures.push(`${buildUrl} gitCommit mismatch: live=${body?.gitCommit ?? 'missing'} expected=${expectedCommit}`);
    }
    if (body?.nodeEnv !== 'production') {
      failures.push(`${buildUrl} NODE_ENV mismatch: live=${body?.nodeEnv ?? 'missing'} expected=production`);
    }
    if (body?.port !== '3000') {
      failures.push(`${buildUrl} PORT mismatch: live=${body?.port ?? 'missing'} expected=3000`);
    }
    if (body?.sessionCookieDomain !== '.adisyum.com') {
      failures.push(`${buildUrl} SESSION_COOKIE_DOMAIN mismatch: live=${body?.sessionCookieDomain ?? 'missing'} expected=.adisyum.com`);
    }
    if (!body?.deploymentTime) {
      failures.push(`${buildUrl} deploymentTime missing`);
    }
    checks.runtimeBuildId = { url: buildUrl, status: response.status, ok: response.status !== 404, body };
  } catch (error) {
    failures.push(`${buildUrl} request failed: ${error instanceof Error ? error.message : String(error)}`);
    checks.runtimeBuildId = { url: buildUrl, status: null, ok: false };
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
  expected: {
    gitCommit: expectedCommit || null,
    buildId: expectedBuildId || null,
  },
  live,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
