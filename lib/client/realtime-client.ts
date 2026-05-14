'use client';

import { getKdsEcho } from '@/lib/realtime/kds-echo';

let activeTenantId: string | null = null;

export function connectTenantRealtime(tenantId: string | null | undefined) {
  const normalizedTenantId = typeof tenantId === 'string' && tenantId.trim().length > 0 ? tenantId.trim() : null;
  if (!normalizedTenantId) {
    disconnectTenantRealtime();
    return;
  }

  if (activeTenantId === normalizedTenantId) return;
  disconnectTenantRealtime();
  activeTenantId = normalizedTenantId;
  getKdsEcho();
}

export function reconnectTenantRealtime(tenantId: string | null | undefined) {
  disconnectTenantRealtime();
  connectTenantRealtime(tenantId);
}

export function disconnectTenantRealtime() {
  const echo = getKdsEcho();
  if (echo) {
    echo.disconnect();
  }
  activeTenantId = null;
}

export function getActiveRealtimeTenantId() {
  return activeTenantId;
}
