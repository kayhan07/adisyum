const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const DEFAULT_TENANT_KEY = 'demo-bistro';
const DEFAULT_EMAIL = 'admin@aurelia.local';
const DEFAULT_PASSWORD = 'password';
const TOKEN_TTL_MS = 1000 * 60 * 6;

type BackendSession = {
  token: string;
  expiresAt: number;
};

let sessionCache: BackendSession | null = null;

export function getBackendBaseUrl(): string {
  return (process.env.AURELIA_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '');
}

export function getTenantKey(): string {
  return process.env.AURELIA_TENANT_KEY ?? DEFAULT_TENANT_KEY;
}

export async function getBackendAccessToken(): Promise<string> {
  if (sessionCache && sessionCache.expiresAt > Date.now()) {
    return sessionCache.token;
  }

  const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: process.env.AURELIA_BACKEND_EMAIL ?? DEFAULT_EMAIL,
      password: process.env.AURELIA_BACKEND_PASSWORD ?? DEFAULT_PASSWORD,
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;

  if (!response.ok || !payload?.token) {
    throw new Error(payload?.message ?? 'Backend oturumu açılamadı.');
  }

  sessionCache = {
    token: payload.token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  return payload.token;
}

export function clearBackendAccessToken(): void {
  sessionCache = null;
}