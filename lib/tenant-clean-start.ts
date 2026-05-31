'use client';

import { useEffect, useState } from 'react';
import { loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';

const DEFAULT_SEED_TENANT_ID = 'ABN-48291';

const TENANT_LOCAL_CACHE_PREFIXES = [
  'adisyum-local-sale-products',
  'adisyum-local-product-categories',
  'adisyum-local-created-raw-ingredients',
  'adisyum-local-recipe-pool',
  'adisyum-local-integrations-state',
  'adisyon-local-accounts',
  'adisyon-finance-invoices',
  'adisyon-finance-account-transactions',
  'adisyon-treasury-runtime-movements',
  'adisyon-custom-treasury-accounts',
] as const;

export function shouldUseSeedBusinessData() {
  const session = loadSessionState();
  return session.isAuthenticated && session.tenantId === DEFAULT_SEED_TENANT_ID;
}

export function useSeedBusinessDataEnabled() {
  const [enabled, setEnabled] = useState(() => shouldUseSeedBusinessData());

  useEffect(() => {
    const refresh = () => setEnabled(shouldUseSeedBusinessData());
    refresh();
    return subscribeToSessionChanges(refresh);
  }, []);

  return enabled;
}

export function resetTenantBusinessCachesForLogin(nextTenantId: string) {
  if (typeof window === 'undefined') return;
  const normalizedTenantId = nextTenantId.trim();
  if (!normalizedTenantId) return;

  try {
    const keysToRemove = new Set<string>();
    for (const prefix of TENANT_LOCAL_CACHE_PREFIXES) {
      keysToRemove.add(prefix);
      keysToRemove.add(`${prefix}:${normalizedTenantId}`);
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }

    console.info('[tenant-clean-start] tenant business caches reset for login', {
      tenantId: normalizedTenantId,
      removedKeys: Array.from(keysToRemove),
    });
  } catch (error) {
    console.warn('[tenant-clean-start] tenant business cache reset failed', {
      tenantId: normalizedTenantId,
      error,
    });
  }
}
