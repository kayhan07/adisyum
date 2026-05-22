const TOKEN_TTL_MS = 1000 * 60 * 6;

type BackendSession = {
  token: string;
  expiresAt: number;
};

let sessionCache: BackendSession | null = null;

export function getBackendBaseUrl(): string {
  const configuredUrl = process.env.AURELIA_API_URL?.trim();
  if (!configuredUrl) {
    throw new Error('AURELIA_API_URL is required for backend proxy integration.');
  }

  return configuredUrl.replace(/\/$/, '');
}

export function getTenantKey(): string {
  const configuredTenantKey = process.env.AURELIA_TENANT_KEY?.trim();
  if (!configuredTenantKey) {
    throw new Error('AURELIA_TENANT_KEY is required for backend proxy integration.');
  }

  return configuredTenantKey;
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
      email: requiredBackendCredential('AURELIA_BACKEND_EMAIL'),
      password: requiredBackendCredential('AURELIA_BACKEND_PASSWORD'),
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

function requiredBackendCredential(key: 'AURELIA_BACKEND_EMAIL' | 'AURELIA_BACKEND_PASSWORD'): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required for backend proxy integration.`);
  }

  return value;
}
