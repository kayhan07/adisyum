'use client';

export type AuthFailureRuntimeState = 'READY' | 'AUTH_REQUIRED';

export type AuthFailureRuntimeLockSnapshot = {
  state: AuthFailureRuntimeState;
  locked: boolean;
  reason?: string;
  status?: number;
  endpoint?: string;
  firstLockedAt?: string;
  redirectIssued: boolean;
};

type AuthFailureRuntimeLockStore = AuthFailureRuntimeLockSnapshot & {
  listeners: Set<() => void>;
};

type AuthFailureGlobal = typeof globalThis & {
  __ADISYUM_AUTH_FAILURE_RUNTIME_LOCK__?: AuthFailureRuntimeLockStore;
};

const AUTH_FAILURE_RUNTIME_LOCK_KEY = '__ADISYUM_AUTH_FAILURE_RUNTIME_LOCK__';
const AUTH_REQUIRED_RESPONSE_BODY = JSON.stringify({
  ok: false,
  error: 'Unauthorized',
  code: 'auth_required_locked',
});

function createStore(): AuthFailureRuntimeLockStore {
  return {
    state: 'READY',
    locked: false,
    redirectIssued: false,
    listeners: new Set(),
  };
}

function getStore() {
  const runtimeGlobal = globalThis as AuthFailureGlobal;
  if (!runtimeGlobal[AUTH_FAILURE_RUNTIME_LOCK_KEY]) {
    runtimeGlobal[AUTH_FAILURE_RUNTIME_LOCK_KEY] = createStore();
  }
  return runtimeGlobal[AUTH_FAILURE_RUNTIME_LOCK_KEY];
}

function notify(store: AuthFailureRuntimeLockStore) {
  store.listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Diagnostics listeners must never re-enter runtime auth handling.
    }
  });
}

function redirectToSessionRecovery(store: AuthFailureRuntimeLockStore, target: string) {
  if (store.redirectIssued || typeof window === 'undefined') return;
  store.redirectIssued = true;
  const currentPath = window.location.pathname;
  if (currentPath === target) return;
  window.location.replace(target);
}

export const AUTH_FAILURE_RUNTIME_LOCK = {
  isLocked() {
    return getStore().locked;
  },

  shouldStopRuntimeWork() {
    return getStore().locked;
  },

  snapshot(): AuthFailureRuntimeLockSnapshot {
    const store = getStore();
    return {
      state: store.state,
      locked: store.locked,
      reason: store.reason,
      status: store.status,
      endpoint: store.endpoint,
      firstLockedAt: store.firstLockedAt,
      redirectIssued: store.redirectIssued,
    };
  },

  lock(input: {
    endpoint?: string;
    status?: number;
    reason?: string;
    redirectTo?: string;
    redirect?: boolean;
  } = {}) {
    const store = getStore();
    const firstLock = !store.locked;
    store.state = 'AUTH_REQUIRED';
    store.locked = true;
    store.reason = input.reason ?? store.reason ?? 'unauthorized';
    store.status = input.status ?? store.status ?? 401;
    store.endpoint = input.endpoint ?? store.endpoint;
    store.firstLockedAt = store.firstLockedAt ?? new Date().toISOString();

    if (firstLock) {
      console.warn('[auth-runtime-lock] AUTH_REQUIRED', {
        endpoint: store.endpoint,
        status: store.status,
        reason: store.reason,
        firstLockedAt: store.firstLockedAt,
      });
    }

    if (input.redirect !== false) {
      redirectToSessionRecovery(store, input.redirectTo ?? '/app');
    }

    notify(store);
    return this.snapshot();
  },

  reset() {
    const store = getStore();
    const wasLocked = store.locked;
    store.state = 'READY';
    store.locked = false;
    store.reason = undefined;
    store.status = undefined;
    store.endpoint = undefined;
    store.firstLockedAt = undefined;
    store.redirectIssued = false;
    if (wasLocked) {
      console.info('[auth-runtime-lock] READY');
    }
    notify(store);
  },

  subscribe(listener: () => void) {
    const store = getStore();
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  },
};

export function isAuthFailureResponse(response: Response | null | undefined) {
  return response?.status === 401;
}

export function lockRuntimeForAuthFailure(input: {
  endpoint?: string;
  status?: number;
  reason?: string;
  redirectTo?: string;
  redirect?: boolean;
} = {}) {
  return AUTH_FAILURE_RUNTIME_LOCK.lock({
    status: 401,
    reason: 'unauthorized',
    ...input,
  });
}

export function createAuthRequiredLockedResponse() {
  return new Response(AUTH_REQUIRED_RESPONSE_BODY, {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
