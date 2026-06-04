'use client';

import { useEffect, useState } from 'react';
import { loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';

const SEED_BUSINESS_DATA_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SEED_BUSINESS_DATA === '1';
const SEED_TENANT_ID = process.env.NEXT_PUBLIC_SEED_TENANT_ID?.trim();
export const LEGACY_DEMO_TENANT_ID = String.fromCharCode(65, 66, 78, 45, 52, 56, 50, 57, 49);

const TENANT_LOCAL_CACHE_PREFIXES = [
  'adisyum-local-sale-products',
  'adisyum-local-table-layout-state',
  'adisyum-local-product-categories',
  'adisyum-local-created-raw-ingredients',
  'adisyum-local-recipe-pool',
  'adisyum-local-integrations-state',
  'adisyon-sale-products',
  'adisyon-table-layout-state',
  'adisyon-company-state',
  'aurelia-table-payment-requested',
  'aurelia-table-live-totals',
  'aurelia-table-meta',
  'aurelia-table-state-sync-meta',
  'adisyon-table-reservations',
  'adisyon-local-accounts',
  'adisyon-finance-invoices',
  'adisyon-finance-account-transactions',
  'adisyon-treasury-runtime-movements',
  'adisyon-custom-treasury-accounts',
  'adisyon-daily-cash-movements',
  'aurelia-qr-pending-orders',
] as const;

export function shouldUseSeedBusinessData() {
  const session = loadSessionState();
  return Boolean(SEED_BUSINESS_DATA_ENABLED && SEED_TENANT_ID && session.isAuthenticated && session.tenantId === SEED_TENANT_ID);
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
      keysToRemove.add(`${prefix}:anonymous`);
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }

    console.info('[tenant-clean-start] legacy tenant business caches reset for login', {
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

export function purgeLegacyDemoTenantClientState() {
  if (typeof window === 'undefined') return;

  const containsLegacyDemoTenant = (value: string | null) => Boolean(value && value.includes(LEGACY_DEMO_TENANT_ID));

  try {
    const removed: string[] = [];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key) continue;
        const value = storage.getItem(key);
        if (key.includes(LEGACY_DEMO_TENANT_ID) || containsLegacyDemoTenant(value)) {
          storage.removeItem(key);
          removed.push(key);
        }
      }
    }

    if (removed.length > 0) {
      console.info('[tenant-clean-start] legacy demo tenant client state purged', {
        tenantId: LEGACY_DEMO_TENANT_ID,
        removedKeys: removed,
      });
    }
  } catch (error) {
    console.warn('[tenant-clean-start] legacy demo tenant purge failed', {
      tenantId: LEGACY_DEMO_TENANT_ID,
      error,
    });
  }
}
