'use client';

import {
  AUTH_FAILURE_RUNTIME_LOCK,
  createAuthRequiredLockedResponse,
  isAuthFailureResponse,
  lockRuntimeForAuthFailure,
} from '@/lib/runtime/auth-failure-runtime-lock';

export type RuntimeApiPath = '/api' | `/api/${string}`;

export const POS_TABLE_ORDERS_API = '/api/pos/table-orders' as const;

function normalizeApiPath(path: RuntimeApiPath) {
  const normalized = path.startsWith('/api/') || path === '/api'
    ? path
    : (`/api/${String(path).replace(/^\/+/, '')}` as RuntimeApiPath);
  if (normalized.startsWith('/app/api/') || normalized.startsWith('/adisyonsistemi/api/')) {
    throw new Error(`[runtime-api] Refusing non-root API path: ${normalized}`);
  }
  return normalized;
}

export function buildApiUrl(path: RuntimeApiPath) {
  const normalized = normalizeApiPath(path);
  if (typeof window === 'undefined') return normalized;
  const url = new URL(normalized, window.location.origin);
  if (url.pathname !== normalized) {
    throw new Error(`[runtime-api] API path drift detected: ${url.pathname}`);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isRuntimeAuthRequired() {
  return AUTH_FAILURE_RUNTIME_LOCK.shouldStopRuntimeWork();
}

export function resetRuntimeAuthFailureLock() {
  AUTH_FAILURE_RUNTIME_LOCK.reset();
}

export function getRuntimeAuthFailureSnapshot() {
  return AUTH_FAILURE_RUNTIME_LOCK.snapshot();
}

export function runtimeFetch(path: RuntimeApiPath, init: RequestInit = {}) {
  const requestUrl = buildApiUrl(path);
  const isAuthRecoveryRequest = requestUrl === '/api/auth/me' || requestUrl.startsWith('/api/auth/');
  if (AUTH_FAILURE_RUNTIME_LOCK.shouldStopRuntimeWork() && !isAuthRecoveryRequest) {
    return Promise.resolve(createAuthRequiredLockedResponse());
  }

  return fetch(requestUrl, {
    ...init,
    credentials: init.credentials ?? 'include',
  }).then((response) => {
    if (isAuthFailureResponse(response)) {
      lockRuntimeForAuthFailure({
        endpoint: requestUrl,
        status: response.status,
        reason: 'runtime_api_unauthorized',
      });
    } else if (response.ok && isAuthRecoveryRequest) {
      AUTH_FAILURE_RUNTIME_LOCK.reset();
    }

    return response;
  });
}
