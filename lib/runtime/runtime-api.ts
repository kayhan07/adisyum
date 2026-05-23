'use client';

import {
  AUTH_FAILURE_RUNTIME_LOCK,
  createAuthRequiredLockedResponse,
  isAuthFailureResponse,
  lockRuntimeForAuthFailure,
} from '@/lib/runtime/auth-failure-runtime-lock';

export type RuntimeApiPath = '/api' | `/api/${string}`;

export const POS_TABLE_ORDERS_API = '/api/pos/table-orders' as const;
export const RUNTIME_POS_CATALOG_API = '/api/runtime/pos-catalog' as const;
export const RUNTIME_BUILD_ID_API = '/api/runtime-build-id' as const;

const BLOCKED_LEGACY_API_PREFIXES = [
  '/app/api',
  '/adisyonsistemi/api',
  '/api/app',
  '/api/adisyonsistemi',
] as const;

const DEPRECATED_RUNTIME_API_PREFIXES = [
  '/api/table-orders',
  '/api/legacy',
] as const;

const INVALID_RUNTIME_API_FALLBACK = `${RUNTIME_BUILD_ID_API}?runtimeApi=blocked` as const;

type RuntimeApiOwnershipResult =
  | { ok: true; url: RuntimeApiPath }
  | { ok: false; code: string; message: string; safeUrl: RuntimeApiPath };

function getRuntimeOrigin() {
  return typeof window === 'undefined' ? null : window.location.origin;
}

function normalizeApiPath(path: RuntimeApiPath): RuntimeApiOwnershipResult {
  const rawPath = String(path);
  const origin = getRuntimeOrigin();

  if (/^https?:\/\//i.test(rawPath)) {
    if (!origin) {
      return {
        ok: false,
        code: 'absolute_api_path_without_runtime_origin',
        message: `[runtime-api] Refusing absolute API path without browser origin: ${rawPath}`,
        safeUrl: INVALID_RUNTIME_API_FALLBACK,
      };
    }

    let absoluteUrl: URL;
    try {
      absoluteUrl = new URL(rawPath);
    } catch {
      return {
        ok: false,
        code: 'invalid_absolute_api_path',
        message: `[runtime-api] Refusing malformed absolute API path: ${rawPath}`,
        safeUrl: INVALID_RUNTIME_API_FALLBACK,
      };
    }
    if (absoluteUrl.origin !== origin) {
      return {
        ok: false,
        code: 'wrong_api_host_ownership',
        message: `[runtime-api] Refusing wrong-host API path: ${absoluteUrl.origin}`,
        safeUrl: INVALID_RUNTIME_API_FALLBACK,
      };
    }

    const sameOriginPath = `${absoluteUrl.pathname}${absoluteUrl.search}${absoluteUrl.hash}` as RuntimeApiPath;
    return normalizeApiPath(sameOriginPath);
  }

  const normalized = rawPath.startsWith('/api/') || rawPath === '/api'
    ? rawPath
    : (`/api/${rawPath.replace(/^\/+/, '')}` as RuntimeApiPath);

  const pathname = normalized.split(/[?#]/, 1)[0] || '/api';

  if (BLOCKED_LEGACY_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return {
      ok: false,
      code: 'legacy_api_namespace',
      message: `[runtime-api] Refusing non-root API path: ${rawPath}`,
      safeUrl: INVALID_RUNTIME_API_FALLBACK,
    };
  }

  if (DEPRECATED_RUNTIME_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return {
      ok: false,
      code: 'deprecated_runtime_api_path',
      message: `[runtime-api] Refusing deprecated runtime API path: ${pathname}`,
      safeUrl: INVALID_RUNTIME_API_FALLBACK,
    };
  }

  if (!(pathname === '/api' || pathname.startsWith('/api/'))) {
    return {
      ok: false,
      code: 'invalid_runtime_api_namespace',
      message: `[runtime-api] Refusing invalid API namespace: ${pathname}`,
      safeUrl: INVALID_RUNTIME_API_FALLBACK,
    };
  }

  return { ok: true, url: normalized as RuntimeApiPath };
}

export function assertApiOwnership(path: RuntimeApiPath): RuntimeApiOwnershipResult {
  return normalizeApiPath(path);
}

export function buildApiUrl(path: RuntimeApiPath) {
  const ownership = assertApiOwnership(path);
  if (!ownership.ok) {
    console.warn('[runtime-api] blocked invalid API path', {
      path,
      code: ownership.code,
      message: ownership.message,
    });
    return ownership.safeUrl;
  }
  const normalized = ownership.url;
  if (typeof window === 'undefined') return normalized;
  const url = new URL(normalized, window.location.origin);
  const normalizedPathname = normalized.split(/[?#]/, 1)[0] || '/api';
  if (url.pathname !== normalizedPathname) {
    console.warn('[runtime-api] API path drift detected', {
      path,
      pathname: url.pathname,
      expectedPathname: normalizedPathname,
    });
    return INVALID_RUNTIME_API_FALLBACK;
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
  const ownership = assertApiOwnership(path);
  if (!ownership.ok) {
    console.warn('[runtime-api] blocked invalid API path', {
      path,
      code: ownership.code,
      message: ownership.message,
    });
    return Promise.resolve(Response.json({
      ok: false,
      error: 'Invalid runtime API path',
      kind: 'invalid_runtime_api_path',
      code: ownership.code,
    }, { status: 400 }));
  }
  const requestUrl = buildApiUrl(ownership.url);
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
