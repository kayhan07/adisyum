'use client';

const HTTP_BASES = ['http://127.0.0.1:3001', 'http://localhost:3001'];
const HTTPS_BASES = ['https://127.0.0.1:3443', 'https://localhost:3443'];

type LocalAgentRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
};

function getPreferredBases() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return [...HTTPS_BASES, ...HTTP_BASES];
  }

  return [...HTTP_BASES, ...HTTPS_BASES];
}

export function getLocalAgentBaseHint() {
  return `${HTTP_BASES[0]} / ${HTTP_BASES[1]} veya ${HTTPS_BASES[0]} / ${HTTPS_BASES[1]}`;
}

export async function fetchFromLocalAgent(path: string, options: LocalAgentRequestOptions = {}) {
  const bases = getPreferredBases();
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      console.log('[LocalAgent] trying', base + path);
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
        console.warn('[LocalAgent]', base + path, 'status', response.status);
        lastError = new Error(`Local agent status ${response.status}`);
        continue;
      }

      console.log('[LocalAgent] success', base + path);
      return { response, base };
    } catch (error) {
      console.warn('[LocalAgent]', base + path, 'error:', error);
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
