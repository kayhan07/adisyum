'use client';

import { clearRegisteredQueryClient, getRegisteredQueryClient } from '@/lib/query/client';
import { clearRuntimeScope } from '@/lib/client/runtime-state';
import { disconnectTenantRealtime } from '@/lib/client/realtime-client';
import { clearSessionState } from '@/lib/session-store';
import { clearAuthSnapshot } from '@/lib/saas-store';
import { clearOfflineOrderQueue } from '@/lib/offline-sync-store';

export async function resetTenantIsolation() {
  const queryClient = getRegisteredQueryClient();
  queryClient?.clear();
  await Promise.allSettled([
    clearRuntimeScope('tenant'),
    clearOfflineOrderQueue(),
  ]);
  disconnectTenantRealtime();
  clearSessionState();
  clearAuthSnapshot();
}

export async function resetSystemAdminIsolation() {
  const queryClient = getRegisteredQueryClient();
  queryClient?.clear();
  await clearRuntimeScope('system-admin');
  disconnectTenantRealtime();
  clearSessionState();
  clearAuthSnapshot();
}

export function disposeIsolationRegistry() {
  clearRegisteredQueryClient();
}
