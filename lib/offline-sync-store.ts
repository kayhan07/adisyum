'use client';

type OfflineOrderSnapshot = {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  payload: unknown;
  created_at: string;
  synced: boolean;
};

const STORAGE_KEY = 'adisyon-offline-order-queue';
const EVENT_NAME = 'adisyon-offline-sync:changed';

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadOfflineOrderQueue(): OfflineOrderSnapshot[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function queueOfflineOrderSnapshot(input: Omit<OfflineOrderSnapshot, 'id' | 'created_at' | 'synced'>) {
  if (!canUseStorage()) return;
  const queue = loadOfflineOrderQueue();
  const nextItem: OfflineOrderSnapshot = {
    ...input,
    id: `${input.tenant_id}-${input.branch_id}-${input.table_id}-${Date.now()}`,
    created_at: new Date().toISOString(),
    synced: false,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([nextItem, ...queue].slice(0, 500)));
  emitChange();
}

export async function syncOfflineOrders() {
  if (!canUseStorage() || typeof navigator === 'undefined' || !navigator.onLine) return { synced: 0 };
  const queue = loadOfflineOrderQueue().filter((item) => !item.synced);
  if (queue.length === 0) return { synced: 0 };

  try {
    await fetch('/api/offline-sync/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orders: queue }),
    });
    const nextQueue = loadOfflineOrderQueue().map((item) =>
      queue.some((queued) => queued.id === item.id) ? { ...item, synced: true } : item
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextQueue.slice(0, 500)));
    emitChange();
    return { synced: queue.length };
  } catch {
    return { synced: 0 };
  }
}
