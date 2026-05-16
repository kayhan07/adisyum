import { bootstrapRuntimeScope, persistRuntimeScope, readRuntimeItem, refreshRuntimeScope, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';
import {
  getAuthoritativeOrdersByTable,
  refreshAuthoritativeOrdersByTable,
  replaceAuthoritativeOrdersByTable,
  subscribeToAuthoritativeOrders,
} from '@/lib/client/authoritative-table-orders';

const STORAGE_KEY = 'aurelia-table-payment-requested';
const TOTALS_STORAGE_KEY = 'aurelia-table-live-totals';
const META_STORAGE_KEY = 'aurelia-table-meta';
const STATE_META_STORAGE_KEY = 'aurelia-table-state-sync-meta';
const EVENT_NAME = 'aurelia-table-payment-requested:changed';
let serverBootstrapCompleted = false;
let tableStateWriteCounter = 0;
let tableStateSyncCounter = 0;
const runtimeClientId = `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type TableStateSyncMeta = {
  version: number;
  updatedAtMs: number;
  clientId: string;
  mutationId: string;
  source: string;
  tableId?: string;
  activeOrderTables: string[];
};

type SharedTablePaymentState = {
  paymentRequestedTableIds: string[];
  liveTotals: Record<string, number>;
  ordersByTable: Record<string, unknown[]>;
  tableMeta: Record<string, StoredTableMeta>;
  stateMeta: TableStateSyncMeta | null;
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

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function writeRuntimeJsonIfChanged(key: string, value: unknown, options: { persist?: boolean } = {}) {
  const next = stableJson(value);
  if (readRuntimeItem('tenant', key) === next) {
    return false;
  }

  writeRuntimeItem('tenant', key, next, options);
  tableStateWriteCounter += 1;
  if (typeof window !== 'undefined') {
    console.info('[adisyon-flow] table-runtime-write', {
      key,
      writeCount: tableStateWriteCounter,
      persist: options.persist !== false,
    });
  }
  return true;
}

function readTableStateSyncMeta() {
  const raw = readRuntimeItem('tenant', STATE_META_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TableStateSyncMeta>;
    if (typeof parsed.version !== 'number' || typeof parsed.updatedAtMs !== 'number') return null;
    return {
      version: parsed.version,
      updatedAtMs: parsed.updatedAtMs,
      clientId: String(parsed.clientId ?? 'unknown'),
      mutationId: String(parsed.mutationId ?? 'unknown'),
      source: String(parsed.source ?? 'unknown'),
      tableId: typeof parsed.tableId === 'string' ? parsed.tableId : undefined,
      activeOrderTables: Array.isArray(parsed.activeOrderTables)
        ? parsed.activeOrderTables.filter((value): value is string => typeof value === 'string')
        : [],
    } satisfies TableStateSyncMeta;
  } catch {
    return null;
  }
}

function writeTableStateSyncMeta(source: string, ordersByTable: Record<string, unknown[]>, tableId?: string) {
  const previous = readTableStateSyncMeta();
  const now = Date.now();
  const next: TableStateSyncMeta = {
    version: Math.max(previous?.version ?? 0, now) + 1,
    updatedAtMs: now,
    clientId: runtimeClientId,
    mutationId: `${runtimeClientId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    tableId,
    activeOrderTables: Object.entries(ordersByTable)
      .filter(([, lines]) => Array.isArray(lines) && lines.length > 0)
      .map(([id]) => id),
  };
  writeRuntimeJsonIfChanged(STATE_META_STORAGE_KEY, next);
  return next;
}

function buildSnapshot(): SharedTablePaymentState {
  return {
    paymentRequestedTableIds: getPaymentRequestedTableIds(),
    liveTotals: getTableLiveTotals(),
    ordersByTable: getStoredOrdersByTable(),
    tableMeta: getStoredTableMeta(),
    stateMeta: readTableStateSyncMeta(),
    updatedAt: new Date().toISOString(),
  };
}

function applySnapshot(snapshot: Partial<SharedTablePaymentState>) {
  if (!canUseStorage()) return;

  if (Array.isArray(snapshot.paymentRequestedTableIds)) {
    writeRuntimeJsonIfChanged(STORAGE_KEY, snapshot.paymentRequestedTableIds, { persist: false });
  }
  if (snapshot.liveTotals && typeof snapshot.liveTotals === 'object') {
    writeRuntimeJsonIfChanged(TOTALS_STORAGE_KEY, snapshot.liveTotals, { persist: false });
  }
  if (snapshot.tableMeta && typeof snapshot.tableMeta === 'object') {
    writeRuntimeJsonIfChanged(META_STORAGE_KEY, snapshot.tableMeta, { persist: false });
  }
  if (snapshot.stateMeta && typeof snapshot.stateMeta === 'object') {
    writeRuntimeJsonIfChanged(STATE_META_STORAGE_KEY, snapshot.stateMeta, { persist: false });
  }
}

export async function syncTableStateFromServer() {
  if (typeof window === 'undefined') return null;
  if (!serverBootstrapCompleted) {
    await bootstrapRuntimeScope('tenant');
    serverBootstrapCompleted = true;
  } else {
    await refreshRuntimeScope('tenant');
  }
  await refreshAuthoritativeOrdersByTable();
  tableStateSyncCounter += 1;
  console.info('[adisyon-flow] table-runtime-sync', {
    clientId: runtimeClientId,
    syncCount: tableStateSyncCounter,
    stateMeta: readTableStateSyncMeta(),
    tableCount: Object.keys(getStoredOrdersByTable()).length,
    activeOrderTables: Object.entries(getStoredOrdersByTable()).filter(([, lines]) => Array.isArray(lines) && lines.length > 0).map(([tableId]) => tableId),
    source: 'server-runtime-state',
  });
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

  if (!writeRuntimeJsonIfChanged(STORAGE_KEY, [...current])) return;
  writeTableStateSyncMeta('payment-requested', getStoredOrdersByTable(), tableId);
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

  if (!writeRuntimeJsonIfChanged(TOTALS_STORAGE_KEY, { ...getTableLiveTotals(), ...totals })) return;
  writeTableStateSyncMeta('totals', getStoredOrdersByTable(), Object.keys(totals)[0]);
  emitChange();
  publishTableState();
}

export function getStoredOrdersByTable<T>() {
  return getAuthoritativeOrdersByTable<T>();
}

export function setStoredOrdersByTable<T>(orders: Record<string, T[]>) {
  const nextOrders = { ...getStoredOrdersByTable<T>(), ...orders };
  replaceAuthoritativeOrdersByTable(nextOrders);
}

export function subscribeToStoredOrdersChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  return subscribeToAuthoritativeOrders(callback);
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
