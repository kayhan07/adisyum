import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[auth-runtime-lock] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const lock = read('lib/runtime/auth-failure-runtime-lock.ts');
const runtimeApi = read('lib/runtime/runtime-api.ts');
const runtimeSync = read('lib/pos-runtime/runtime-sync-engine.ts');
const orderMutations = read('lib/pos-runtime/order-mutations.ts');
const runtimeProvider = read('components/providers/app-runtime-provider.tsx');
const orderComposer = read('components/order-composer.tsx');
const kdsBoard = read('components/kds/kds-board.tsx');
const runtimeState = read('lib/client/runtime-state.ts');
const realtimeClient = read('lib/client/realtime-client.ts');
const offlineSync = read('lib/offline-sync-store.ts');

assert(/AUTH_FAILURE_RUNTIME_LOCK/.test(lock), 'global auth failure runtime lock must exist');
assert(/AUTH_REQUIRED/.test(lock), 'auth failure lock must expose AUTH_REQUIRED state');
assert(/redirectToSessionRecovery/.test(lock), 'auth failure lock must own single session recovery redirect');
assert(/redirectIssued/.test(lock), 'auth failure redirect must be issued once');

assert(/isAuthFailureResponse\(response\)/.test(runtimeApi), 'runtimeFetch must detect 401 responses centrally');
assert(/lockRuntimeForAuthFailure/.test(runtimeApi), 'runtimeFetch must lock runtime on 401');
assert(/createAuthRequiredLockedResponse/.test(runtimeApi), 'runtimeFetch must suppress non-auth requests while locked');
assert(/isAuthRecoveryRequest/.test(runtimeApi), 'runtimeFetch must allow session recovery requests while locked');

assert(/isRuntimeAuthRequired/.test(runtimeSync), 'runtime sync engine must observe auth lock');
assert(/runtime hydration stopped/.test(runtimeSync), 'hydration must stop on auth lock');
assert(/authoritative sync stopped/.test(runtimeSync), 'authoritative sync must stop on auth lock');

assert(/isRuntimeAuthRequired/.test(orderMutations), 'order mutations must observe auth lock');
assert(/auth_failure_runtime_lock/.test(orderMutations), 'order mutation dispatch must stop while auth locked');

assert(/resetRuntimeAuthFailureLock/.test(runtimeProvider), 'runtime provider must reset auth lock after restored session');
assert(/isRuntimeAuthRequired/.test(runtimeProvider), 'runtime provider loops must observe auth lock');

assert(/authoritative-orders-hydration-stopped/.test(orderComposer), 'POS hydration must stop cleanly on auth lock');
assert(/Oturum gerekli/.test(orderComposer), 'POS user intent must surface auth-required state');

assert(/runtimeFetch/.test(kdsBoard), 'KDS polling must use centralized runtimeFetch');
assert(/isRuntimeAuthRequired/.test(kdsBoard), 'KDS polling must stop on auth lock');

assert(/isRuntimeAuthRequired/.test(runtimeState), 'runtime state persistence must observe auth lock');
assert(/isRuntimeAuthRequired/.test(realtimeClient), 'realtime reconnect must observe auth lock');
assert(/isRuntimeAuthRequired/.test(offlineSync), 'offline sync must observe auth lock');

if (!process.exitCode) {
  console.log('[auth-runtime-lock] PASS');
}
