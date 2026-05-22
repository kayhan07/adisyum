'use client';

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

export function runtimeFetch(path: RuntimeApiPath, init: RequestInit = {}) {
  return fetch(buildApiUrl(path), {
    ...init,
    credentials: init.credentials ?? 'include',
  });
}
