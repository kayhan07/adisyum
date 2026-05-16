import { bootstrapRuntimeScope, persistRuntimeScope, readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

const STORAGE_KEY = 'aurelia-table-payment-requested';
const TOTALS_STORAGE_KEY = 'aurelia-table-live-totals';
const ORDERS_STORAGE_KEY = 'aurelia-orders-by-table';
const META_STORAGE_KEY = 'aurelia-table-meta';
const EVENT_NAME = 'aurelia-table-payment-requested:changed';
let serverBootstrapCompleted = false;

type SharedTablePaymentState = {
  paymentRequestedTableIds: string[];
  liveTotals: Record<string, number>;
  ordersByTable: Record<string, unknown[]>;
  tableMeta: Record<string, StoredTableMeta>;
  updatedAt: string;
};

function emitChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function canUseStorage() {
  return typeof window !== 'undefined';
}

function buildSnapshot(): SharedTablePaymentState {
  return {
    paymentRequestedTableIds: getPaymentRequestedTableIds(),
    liveTotals: getTableLiveTotals(),
    ordersByTable: getStoredOrdersByTable(),
    tableMeta: getStoredTableMeta(),
    updatedAt: new Date().toISOString(),
  };
}

function applySnapshot(snapshot: Partial<SharedTablePaymentState>) {
  if (!canUseStorage()) return;

  if (Array.isArray(snapshot.paymentRequestedTableIds)) {
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(snapshot.paymentRequestedTableIds), { persist: false });
  }
  if (snapshot.liveTotals && typeof snapshot.liveTotals === 'object') {
    writeRuntimeItem('tenant', TOTALS_STORAGE_KEY, JSON.stringify(snapshot.liveTotals), { persist: false });
  }
  if (snapshot.ordersByTable && typeof snapshot.ordersByTable === 'object') {
    writeRuntimeItem('tenant', ORDERS_STORAGE_KEY, JSON.stringify(snapshot.ordersByTable), { persist: false });
  }
  if (snapshot.tableMeta && typeof snapshot.tableMeta === 'object') {
    writeRuntimeItem('tenant', META_STORAGE_KEY, JSON.stringify(snapshot.tableMeta), { persist: false });
  }
}

export async function syncTableStateFromServer() {
  if (typeof window === 'undefined') return null;
  if (!serverBootstrapCompleted) {
    await bootstrapRuntimeScope('tenant');
    serverBootstrapCompleted = true;
  }
  emitChange();
  return buildSnapshot();
}

export function publishTableState() {
  if (!canUseStorage()) return;
  void persistRuntimeScope('tenant');
}

export function getPaymentRequestedTableIds() {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  const raw = readRuntimeItem('tenant', STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function setTablePaymentRequested(tableId: string, requested: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = new Set(getPaymentRequestedTableIds());

  if (requested) {
    current.add(tableId);
  } else {
    current.delete(tableId);
  }

  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify([...current]));
  emitChange();
  publishTableState();
}

export function subscribeToPaymentRequestedChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustom = () => {
    callback();
  };

  window.addEventListener(EVENT_NAME, handleCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustom);
    unsubscribeRuntime();
  };
}

export function getTableLiveTotals() {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>;
  }

  const raw = readRuntimeItem('tenant', TOTALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return {};
  }
}

export function setTableLiveTotals(totals: Record<string, number>) {
  if (typeof window === 'undefined') {
    return;
  }

  writeRuntimeItem('tenant', TOTALS_STORAGE_KEY, JSON.stringify({ ...getTableLiveTotals(), ...totals }));
  emitChange();
  publishTableState();
}

export function getStoredOrdersByTable<T>() {
  if (typeof window === 'undefined') {
    return {} as Record<string, T[]>;
  }

  const raw = readRuntimeItem('tenant', ORDERS_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, T[]>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, T[]] => Array.isArray(entry[1])),
    );
  } catch {
    return {} as Record<string, T[]>;
  }
}

export function setStoredOrdersByTable<T>(orders: Record<string, T[]>) {
  if (typeof window === 'undefined') {
    return;
  }

  writeRuntimeItem(
    'tenant',
    ORDERS_STORAGE_KEY,
    JSON.stringify({ ...getStoredOrdersByTable<T>(), ...orders }),
  );
  emitChange();
  publishTableState();
}

export function subscribeToStoredOrdersChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustom = () => {
    callback();
  };

  window.addEventListener(EVENT_NAME, handleCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustom);
    unsubscribeRuntime();
  };
}

export type StoredTableMeta = {
  guests?: number;
  reservationName?: string;
  reservationPhone?: string;
  reservationStatus?: 'arrived' | 'no_show' | 'waiting';
  reservationTime?: string;
  reservationDate?: string;
  reservationEvent?: string;
  reservationDeposit?: number;
  note?: string;
  openedAt?: string;
  lastActionAt?: string;
  mergedFromIds?: string[];
  mergedSnapshot?: {
    sourceOrders: Record<string, unknown[]>;
    sourceMeta: Record<string, StoredTableMeta>;
  };
};

export function getStoredTableMeta() {
  if (typeof window === 'undefined') {
    return {} as Record<string, StoredTableMeta>;
  }

  const raw = readRuntimeItem('tenant', META_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, StoredTableMeta>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, StoredTableMeta>;
    return parsed ?? {};
  } catch {
    return {} as Record<string, StoredTableMeta>;
  }
}

export function setStoredTableMeta(meta: Record<string, StoredTableMeta>) {
  if (typeof window === 'undefined') {
    return;
  }

  writeRuntimeItem('tenant', META_STORAGE_KEY, JSON.stringify({ ...getStoredTableMeta(), ...meta }));
  emitChange();
  publishTableState();
}
