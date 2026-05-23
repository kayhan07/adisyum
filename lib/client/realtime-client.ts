'use client';

import { getKdsEcho } from '@/lib/realtime/kds-echo';
import { isRuntimeAuthRequired } from '@/lib/runtime/runtime-api';

let activeTenantId: string | null = null;

export function connectTenantRealtime(tenantId: string | null | undefined) {
  if (isRuntimeAuthRequired()) {
    disconnectTenantRealtime();
    return;
  }
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
  if (isRuntimeAuthRequired()) {
    disconnectTenantRealtime();
    return;
  }
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
