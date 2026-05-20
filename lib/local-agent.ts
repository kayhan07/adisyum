'use client';

const HTTP_BASES = ['http://127.0.0.1:4891', 'http://localhost:4891'];
const HTTPS_BASES = ['https://127.0.0.1:3443', 'https://localhost:3443'];

type LocalAgentRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
};

const PROXY_ROUTES: Record<string, string> = {
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
  return `${HTTP_BASES[0]} / ${HTTP_BASES[1]} veya ${HTTPS_BASES[0]} / ${HTTPS_BASES[1]} (proxy: /api/printers/local-agent)`;
}

export async function fetchFromLocalAgent(path: string, options: LocalAgentRequestOptions = {}) {
  const proxyRoute = PROXY_ROUTES[path] ?? '/api/printers/local-agent';
  const nextBody = (() => {
    if (path !== '/print' || options.body === undefined || options.body === null || typeof options.body !== 'object') {
      return options.body;
    }

    const body = options.body as Record<string, unknown>;
    if (typeof body.source === 'string' && body.source.trim().length > 0) {
      return body;
    }

    return { ...body, source: 'proxy:local-agent-client' };
  })();

  const response = await fetch(proxyRoute, {
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
