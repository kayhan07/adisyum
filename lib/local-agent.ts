'use client';

import { runtimeFetch } from '@/lib/runtime/runtime-api';

const HTTP_BASES = ['http://localhost:4891', 'http://127.0.0.1:4891'];

type LocalAgentRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
};

type LocalAgentFetchInit = RequestInit & {
  targetAddressSpace?: 'local' | 'loopback' | 'private' | 'public';
};

const PROXY_ROUTES: Record<string, string> = {
  '/health': '/api/printers/local-agent',
  '/printers': '/api/printers/local-agent',
  '/print': '/api/printers/local-agent/print',
};

declare global {
  interface Window {
    adisyumDesktop?: unknown;
  }
}

export function isLocalBridgeBrowserRuntimeEnabled() {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_ENABLE_LOCAL_BRIDGE === '1') return true;
  return Boolean(window.adisyumDesktop);
}

export function getLocalBridgeHealthUrl() {
  if (!isLocalBridgeBrowserRuntimeEnabled()) return null;
  const port = process.env.NEXT_PUBLIC_LOCAL_BRIDGE_PORT ?? '4891';
  return ['http://', '127.0.0.1', ':', port, '/health'].join('');
}

export function getLocalAgentBaseHint() {
  return `${HTTP_BASES[0]} / ${HTTP_BASES[1]} (yedek proxy: /api/printers/local-agent)`;
}

function directLocalAgentBases() {
  return HTTP_BASES;
}

async function fetchDirectLocalAgent(path: string, options: LocalAgentRequestOptions = {}) {
  let lastError: unknown = null;

  for (const base of directLocalAgentBases()) {
    const controller = new AbortController();
    const timeoutMs = path === '/printers' ? 30000 : 5000;
    const startedAt = Date.now();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const init: LocalAgentFetchInit = {
        method: options.method ?? 'GET',
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit',
        targetAddressSpace: 'loopback',
        headers: {
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers ?? {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      };

      const response = await fetch(`${base}${path}`, init);

      if (!response.ok) {
        lastError = new Error(`Local agent status ${response.status}`);
        if (path !== '/health') {
          console.warn('[business-flow] direct local agent returned non-ok status', {
            base,
            path,
            status: response.status,
            durationMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
        }
        continue;
      }

      if (path !== '/health') {
        console.info('[business-flow] direct local agent connected', {
          base,
          path,
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        });
      }
      return { response, base };
    } catch (error) {
      lastError = error;
      if (path !== '/health') {
        console.warn('[business-flow] direct local agent base failed', {
          base,
          path,
          durationMs: Date.now() - startedAt,
          timeoutMs,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw (lastError ?? new Error('Local agent erişilemedi.'));
}

export async function fetchFromLocalAgent(path: string, options: LocalAgentRequestOptions = {}) {
  const startedAt = Date.now();
  const nextBody = (() => {
    if (path !== '/print' || options.body === undefined || options.body === null || typeof options.body !== 'object') {
      return options.body;
    }

    const body = options.body as Record<string, unknown>;
    if (typeof body.source === 'string' && body.source.trim().length > 0) {
      return body;
    }

    return { ...body, source: 'local-agent-client' };
  })();

  if (typeof window !== 'undefined') {
    try {
      return await fetchDirectLocalAgent(path, { ...options, body: nextBody });
    } catch (error) {
      if (path !== '/health') {
        console.warn('[business-flow] direct local agent fetch failed; trying proxy fallback', {
          path,
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const proxyRoute = PROXY_ROUTES[path] ?? '/api/printers/local-agent';
  const response = await runtimeFetch(proxyRoute as `/api/${string}`, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    body: nextBody !== undefined ? JSON.stringify(nextBody) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Local agent proxy status ${response.status}`);
  }

  if (path !== '/health') {
    console.info('[business-flow] local agent proxy connected', {
      path,
      proxyRoute,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }

  return { response, base: proxyRoute };
}

export async function fetchLocalAgentJson<T>(path: string, options: LocalAgentRequestOptions = {}) {
  const { response, base } = await fetchFromLocalAgent(path, options);
  const data = await response.json() as T;

  if (typeof data === 'object' && data !== null && 'ok' in data) {
    const result = data as { ok?: boolean; error?: string };
    if (result.ok === false) {
      throw new Error(result.error || 'Local agent erişilemedi.');
    }
  }

  return { data, base };
}
