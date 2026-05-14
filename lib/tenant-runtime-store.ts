'use client';

import { bootstrapRuntimeScope, clearRuntimeScope } from '@/lib/client/runtime-state';

export function initializeTenantRuntimeData(tenantId: string) {
  void tenantId;
  void bootstrapRuntimeScope('tenant');
}

export function activateTenantRuntime(tenantId: string) {
  void tenantId;
  void clearRuntimeScope('tenant').then(() => bootstrapRuntimeScope('tenant'));
}
