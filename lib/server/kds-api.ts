import type { KdsStatus, KdsTicketsResponse, KdsTicket } from '@/lib/kds-types';
import { clearBackendAccessToken, getBackendAccessToken, getBackendBaseUrl, getTenantKey } from '@/lib/server/backend-auth';

async function backendRequest(path: string, init: RequestInit = {}, branchId?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Tenant-Key', getTenantKey());

  if (branchId) {
    headers.set('X-Branch-Id', branchId);
  }

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = await getBackendAccessToken();
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${getBackendBaseUrl()}/api/v1${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (response.status === 401) {
    clearBackendAccessToken();
    const refreshedToken = await getBackendAccessToken();
    headers.set('Authorization', `Bearer ${refreshedToken}`);

    return fetch(`${getBackendBaseUrl()}/api/v1${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }

  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : null;
    throw new Error(message ?? 'KDS backend isteği başarısız oldu.');
  }

  return payload as T;
}

export async function fetchKdsTickets(station: string, branchId?: string): Promise<KdsTicketsResponse> {
  const query = new URLSearchParams({ channel: station });

  if (branchId) {
    query.set('branch_id', branchId);
  }

  const response = await backendRequest(`/kds/tickets?${query.toString()}`, { method: 'GET' }, branchId);
  return readJson<KdsTicketsResponse>(response);
}

export async function updateKdsTicketStatus(ticketId: string, status: KdsStatus, branchId?: string): Promise<KdsTicket> {
  const response = await backendRequest(`/kds/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, branchId);

  return readJson<KdsTicket>(response);
}