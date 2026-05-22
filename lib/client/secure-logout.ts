'use client';

import { resetSystemAdminIsolation, resetTenantIsolation } from '@/lib/client/isolation';
import { clearRuntimeScope } from '@/lib/client/runtime-state';
import { runtimeFetch } from '@/lib/runtime/runtime-api';
import { loadSessionState } from '@/lib/session-store';

export type LogoutReason = 'manual' | 'idle' | 'shift_end' | 'forced' | 'token_revoked';
export type LogoutScope = 'current' | 'user' | 'tenant';

type LogoutSyncEvent = {
  type: 'logout';
  at: number;
  reason: LogoutReason;
  scope: LogoutScope;
};

const LOGOUT_EVENT = 'adisyum:secure-logout';
const STORAGE_KEY = 'adisyum:logout-sync';
let broadcastChannel: BroadcastChannel | null = null;
let logoutInProgress = false;

function getChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel('adisyum-logout-sync');
  }
  return broadcastChannel;
}

function emitLogoutEvent(event: LogoutSyncEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOGOUT_EVENT, { detail: event }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  getChannel()?.postMessage(event);
}

async function cleanupClientState() {
  const session = loadSessionState();
  const adminMode = session.currentUser.role === 'super_admin';

  if (adminMode) {
    await resetSystemAdminIsolation();
  } else {
    await resetTenantIsolation();
  }

  await Promise.allSettled([
    clearRuntimeScope('tenant'),
    clearRuntimeScope('system-admin'),
  ]);
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  const target = pathname.startsWith('/system-admin') ? '/system-admin' : '/app';
  window.history.replaceState(null, '', target);
  window.location.replace(target);
}

export async function secureLogout(options: {
  reason?: LogoutReason;
  scope?: LogoutScope;
  redirect?: boolean;
  skipServer?: boolean;
} = {}) {
  if (logoutInProgress) return;
  logoutInProgress = true;

  const reason = options.reason ?? 'manual';
  const scope = options.scope ?? 'current';

  try {
    if (!options.skipServer) {
      await runtimeFetch('/api/auth/session', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, scope }),
      }).catch(() => undefined);
    }

    await cleanupClientState();
    emitLogoutEvent({ type: 'logout', at: Date.now(), reason, scope });

    if (options.redirect !== false) {
      redirectToLogin();
    }
  } finally {
    logoutInProgress = false;
  }
}

export function subscribeSecureLogoutSync(callback: (event: LogoutSyncEvent) => void) {
  if (typeof window === 'undefined') return () => undefined;

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<LogoutSyncEvent>).detail;
    if (!detail) return;
    callback(detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue) as LogoutSyncEvent;
      callback(payload);
    } catch {
      // ignore malformed payload
    }
  };

  const onChannel = (event: MessageEvent<LogoutSyncEvent>) => {
    if (!event.data || event.data.type !== 'logout') return;
    callback(event.data);
  };

  window.addEventListener(LOGOUT_EVENT, onCustom as EventListener);
  window.addEventListener('storage', onStorage);
  getChannel()?.addEventListener('message', onChannel);

  return () => {
    window.removeEventListener(LOGOUT_EVENT, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
    getChannel()?.removeEventListener('message', onChannel);
  };
}

export function isLogoutInProgress() {
  return logoutInProgress;
}
