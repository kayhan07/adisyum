import { clearBackendAccessToken, getBackendAccessToken, getBackendBaseUrl, getTenantKey } from '@/lib/server/backend-auth';

async function backendRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Tenant-Key', getTenantKey());

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getBackendAccessToken();
  headers.set('Authorization', `Bearer ${token}`);

  const url = `${getBackendBaseUrl()}/api/v1${path}`;
  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (response.status === 401) {
    clearBackendAccessToken();
    const refreshedToken = await getBackendAccessToken();
    headers.set('Authorization', `Bearer ${refreshedToken}`);

    return fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }

  return response;
}

export async function readBackendJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;

  if (!response.ok) {
    let message: string | null = null;

    if (payload && typeof payload === 'object') {
      if ('message' in payload && typeof payload.message === 'string') {
        message = payload.message;
      } else if ('error' in payload && typeof payload.error === 'string') {
        message = payload.error;
      }
    }

    throw new Error(message ?? fallbackMessage);
  }

  return payload as T;
}

export async function posBackendJson<T>(path: string, init: RequestInit = {}, fallbackMessage = 'POS backend isteği başarısız oldu.'): Promise<T> {
  const response = await backendRequest(path, init);
  return readBackendJson<T>(response, fallbackMessage);
}

export async function posBackendResponse(path: string, init: RequestInit = {}): Promise<Response> {
  return backendRequest(path, init);
}
