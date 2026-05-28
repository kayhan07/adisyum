'use client';

import { bootstrapRuntimeScope, clearRuntimeScope } from '@/lib/client/runtime-state';

export function initializeTenantRuntimeData(tenantId: string) {
  void bootstrapRuntimeScope('tenant').catch((error) => {
    console.warn('[runtime-state] tenant runtime bootstrap failed', {
      tenantId,
      runtimeScope: 'tenant',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export function activateTenantRuntime(tenantId: string) {
  void clearRuntimeScope('tenant')
    .then(() => bootstrapRuntimeScope('tenant'))
    .catch((error) => {
      console.warn('[runtime-state] tenant runtime activation failed', {
        tenantId,
        runtimeScope: 'tenant',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
