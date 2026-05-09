'use client';

const ACTIVE_TENANT_RUNTIME_KEY = 'adisyon-active-tenant-runtime';

const TENANT_RUNTIME_EXACT_KEYS = [
  'adisyon-sale-products',
  'adisyon-delivery-state',
  'adisyon-product-mappings',
  'adisyon-raw-stock-counts',
  'adisyon-table-layout-state',
  'adisyon-table-reservations',
  'adisyon-treasury-runtime-movements',
  'adisyon-custom-treasury-accounts',
  'adisyon-recent-charge-accounts',
  'aurelia-table-payment-requested',
  'aurelia-table-live-totals',
  'aurelia-orders-by-table',
  'aurelia-table-meta',
  'aurelia-qr-waiter-calls',
  'aurelia-qr-pending-orders',
  'adisyon-purchase-invoices',
  'adisyon-warehouses',
  'adisyon-warehouse-stocks',
  'adisyon-warehouse-transfers',
];

const TENANT_RUNTIME_PREFIX_KEYS = [
  'aurelia-qr-cart:',
];

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function scopedKey(tenantId: string, key: string) {
  return `adisyon-tenant-runtime:${tenantId}:${key}`;
}

function isManagedRuntimeKey(key: string) {
  return TENANT_RUNTIME_EXACT_KEYS.includes(key)
    || TENANT_RUNTIME_PREFIX_KEYS.some((prefix) => key.startsWith(prefix));
}

function listAllStorageKeys() {
  if (!canUseStorage()) return [] as string[];
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function initializeTenantRuntimeData(tenantId: string) {
  if (!canUseStorage()) return;
  const tenantScopedPrefix = `adisyon-tenant-runtime:${tenantId}:`;
  listAllStorageKeys().forEach((key) => {
    if (!key.startsWith(tenantScopedPrefix)) return;
    const originalKey = key.slice(tenantScopedPrefix.length);
    if (isManagedRuntimeKey(originalKey)) {
      window.localStorage.removeItem(key);
    }
  });
}

export function activateTenantRuntime(tenantId: string) {
  if (!canUseStorage()) return;
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) return;

  const previousTenantId = window.localStorage.getItem(ACTIVE_TENANT_RUNTIME_KEY);
  if (previousTenantId === normalizedTenantId) return;

  if (previousTenantId) {
    const keysToPersist = new Set<string>([
      ...TENANT_RUNTIME_EXACT_KEYS,
      ...listAllStorageKeys().filter((key) => TENANT_RUNTIME_PREFIX_KEYS.some((prefix) => key.startsWith(prefix))),
    ]);

    keysToPersist.forEach((key) => {
      const currentValue = window.localStorage.getItem(key);
      const previousScopedKey = scopedKey(previousTenantId, key);
      if (currentValue === null) {
        window.localStorage.removeItem(previousScopedKey);
      } else {
        window.localStorage.setItem(previousScopedKey, currentValue);
      }
    });
  }

  listAllStorageKeys().forEach((key) => {
    if (isManagedRuntimeKey(key)) {
      window.localStorage.removeItem(key);
    }
  });

  const tenantScopedPrefix = `adisyon-tenant-runtime:${normalizedTenantId}:`;
  listAllStorageKeys().forEach((key) => {
    if (!key.startsWith(tenantScopedPrefix)) return;
    const originalKey = key.slice(tenantScopedPrefix.length);
    if (!isManagedRuntimeKey(originalKey)) return;
    const nextValue = window.localStorage.getItem(key);
    if (nextValue !== null) {
      window.localStorage.setItem(originalKey, nextValue);
    }
  });

  window.localStorage.setItem(ACTIVE_TENANT_RUNTIME_KEY, normalizedTenantId);
}
