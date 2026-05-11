'use client';

const HTTP_BASE = 'http://127.0.0.1:3001';
const HTTPS_BASE = 'https://127.0.0.1:3443';

type LocalAgentRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
};

function getPreferredBases() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return [HTTPS_BASE, HTTP_BASE];
  }

  return [HTTP_BASE, HTTPS_BASE];
}

export function getLocalAgentBaseHint() {
  return `${HTTP_BASE} veya ${HTTPS_BASE}`;
}

export async function fetchFromLocalAgent(path: string, options: LocalAgentRequestOptions = {}) {
  const bases = getPreferredBases();
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        cache: 'no-store',
        headers: {
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers ?? {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        lastError = new Error(`Local agent status ${response.status}`);
        continue;
      }

      return { response, base };
    } catch (error) {
      lastError = error;
    }
  }

  throw (lastError ?? new Error('Local agent erişilemedi.'));
}

export async function fetchLocalAgentJson<T>(path: string, options: LocalAgentRequestOptions = {}) {
  const { response, base } = await fetchFromLocalAgent(path, options);
  const data = await response.json() as T;
  return { data, base };
}
