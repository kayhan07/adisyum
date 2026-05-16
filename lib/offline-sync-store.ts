'use client';

import { loadSessionState } from '@/lib/session-store';

export type OfflineOperationType = 'order.snapshot' | 'payment.snapshot' | 'table.snapshot' | 'printer.job';
export type OfflineOperationStatus = 'pending' | 'syncing' | 'failed' | 'synced';
export type OfflineConflictStrategy = 'server-wins' | 'client-wins' | 'merge';

export type OfflineQueueItem = {
  id: string;
  tenantId: string;
  branchId: string;
  tableId: string;
  operationType: OfflineOperationType;
  payload: unknown;
  payloadSignature: string;
  dedupeKey: string;
  source: 'pos' | 'qr' | 'system';
  conflictStrategy: OfflineConflictStrategy;
  status: OfflineOperationStatus;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineTenantMeta = {
  tenantId: string;
  online: boolean;
  syncing: boolean;
  lastSyncAt?: string;
  lastSyncCount: number;
  lastError?: string;
  updatedAt: string;
};

export type OfflineSyncSummary = {
  tenantId: string;
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  retryQueue: number;
  synced: number;
  total: number;
  lastSyncAt?: string;
  lastError?: string;
  items: OfflineQueueItem[];
};

const EVENT_NAME = 'adisyon-offline-sync:changed';
const DB_NAME = 'adisyum-offline-pos';
const DB_VERSION = 2;
const QUEUE_STORE = 'offline_queue';
const META_STORE = 'offline_meta';

const activeSyncs = new Map<string, Promise<OfflineSyncSummary>>();

function canUseStorage() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function normalizeTenantId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveTenantId(preferredTenantId?: string | null) {
  const preferred = normalizeTenantId(preferredTenantId);
  if (preferred) return preferred;
  const sessionTenant = normalizeTenantId(loadSessionState().tenantId);
  return sessionTenant;
}

function createOperationId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => stableValue(item));
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.keys(input as Record<string, unknown>)
        .sort((a, b) => a.localeCompare(b, 'tr'))
        .map((key) => [key, stableValue((input as Record<string, unknown>)[key])]),
    );
  }

  return input;
}

function stableStringify(input: unknown) {
  try {
    return JSON.stringify(stableValue(input));
  } catch {
    return String(input ?? 'null');
  }
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildQueueKey(params: { tenantId: string; branchId: string; tableId: string; operationType: OfflineOperationType; scope?: string }) {
  return [params.tenantId, params.branchId, params.tableId, params.operationType, params.scope ?? 'default'].join('::');
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function openQueueDb() {
  if (!canUseStorage()) return null;

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('tenantId', 'tenantId', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('dedupeKey', 'dedupeKey', { unique: true });
        queueStore.createIndex('tenantStatus', ['tenantId', 'status'], { unique: false });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'tenantId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readAllQueueItems(tenantId: string) {
  const database = await openQueueDb();
  if (!database) return [] as OfflineQueueItem[];

  return new Promise<OfflineQueueItem[]>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result as OfflineQueueItem[] : [];
      resolve(rows.filter((item) => item.tenantId === tenantId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt, 'tr')));
    };

    request.onerror = () => resolve([]);
  });
}

async function readAllQueueItemsForTenant(tenantId: string) {
  return readAllQueueItems(tenantId);
}

async function writeQueueItem(item: OfflineQueueItem) {
  const database = await openQueueDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function removeQueueItems(tenantId?: string) {
  const database = await openQueueDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);

    if (!tenantId) {
      store.clear();
    } else {
      store.getAll().onsuccess = () => {
        const rows = Array.isArray((store.getAll() as IDBRequest).result) ? (store.getAll() as IDBRequest).result as OfflineQueueItem[] : [];
        rows.filter((item) => item.tenantId === tenantId).forEach((item) => store.delete(item.id));
      };
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function readTenantMeta(tenantId: string) {
  const database = await openQueueDb();
  if (!database) return null;

  return new Promise<OfflineTenantMeta | null>((resolve) => {
    const transaction = database.transaction(META_STORE, 'readonly');
    const request = transaction.objectStore(META_STORE).get(tenantId);
    request.onsuccess = () => resolve((request.result as OfflineTenantMeta | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function writeTenantMeta(meta: OfflineTenantMeta) {
  const database = await openQueueDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(meta);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function buildQueueItem(input: {
  id?: string;
  tenantId: string;
  branchId: string;
  tableId: string;
  operationType: OfflineOperationType;
  payload: unknown;
  source?: 'pos' | 'qr' | 'system';
  conflictStrategy?: OfflineConflictStrategy;
  dedupeKey?: string;
}) {
  const now = new Date().toISOString();
  const payloadSignature = hashString(stableStringify(input.payload));
  return {
    id: input.id ?? createOperationId(input.operationType.replace('.', '-')),
    tenantId: input.tenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    operationType: input.operationType,
    payload: cloneJson(input.payload),
    payloadSignature,
    dedupeKey: input.dedupeKey ?? buildQueueKey({
      tenantId: input.tenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      operationType: input.operationType,
      scope: payloadSignature,
    }),
    source: input.source ?? 'pos',
    conflictStrategy: input.conflictStrategy ?? 'server-wins',
    status: 'pending' as const,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  } satisfies OfflineQueueItem;
}

async function upsertQueueItem(nextItem: OfflineQueueItem) {
  const existing = await readAllQueueItemsForTenant(nextItem.tenantId);
  const now = new Date().toISOString();
  const matched = existing.find((item) => item.dedupeKey === nextItem.dedupeKey);

  if (matched && matched.payloadSignature === nextItem.payloadSignature && matched.status !== 'failed') {
    return matched;
  }

  const merged: OfflineQueueItem = matched
    ? {
      ...matched,
      ...nextItem,
      id: matched.id,
      createdAt: matched.createdAt,
      updatedAt: now,
      attempts: matched.status === 'synced' ? 0 : matched.attempts,
      status: 'pending',
      lastError: undefined,
      syncedAt: undefined,
    }
    : {
      ...nextItem,
      updatedAt: now,
      createdAt: now,
    };

  await writeQueueItem(merged);
  return merged;
}

async function appendQueueItem(nextItem: OfflineQueueItem) {
  await writeQueueItem(nextItem);
  return nextItem;
}

async function loadSummary(tenantId: string): Promise<OfflineSyncSummary> {
  const items = await readAllQueueItems(tenantId);
  const meta = await readTenantMeta(tenantId);
  const blockingItems = items.filter((item) => !(item.operationType === 'order.snapshot' && item.status === 'failed'));
  const pending = items.filter((item) => item.status === 'pending').length;
  const failed = blockingItems.filter((item) => item.status === 'failed').length;
  const syncing = items.filter((item) => item.status === 'syncing').length;
  const synced = items.filter((item) => item.status === 'synced').length;

  return {
    tenantId,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncing: meta?.syncing ?? syncing > 0,
    pending,
    failed,
    retryQueue: pending + failed,
    synced,
    total: items.length,
    lastSyncAt: meta?.lastSyncAt,
    lastError: meta?.lastError,
    items,
  };
}

export async function loadOfflineOrderQueue(tenantId?: string) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return [] as OfflineQueueItem[];
  return readAllQueueItems(resolvedTenantId);
}

export async function loadOfflineSyncSummary(tenantId?: string): Promise<OfflineSyncSummary> {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) {
    return {
      tenantId: '',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncing: false,
      pending: 0,
      failed: 0,
      retryQueue: 0,
      synced: 0,
      total: 0,
      items: [],
    };
  }

  return loadSummary(resolvedTenantId);
}

export function subscribeToOfflineSyncChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}

export function queueOfflineOrderSnapshot(input: Omit<OfflineQueueItem, 'id' | 'payloadSignature' | 'dedupeKey' | 'status' | 'attempts' | 'createdAt' | 'updatedAt' | 'operationType' | 'source' | 'conflictStrategy'> & { payload: unknown }) {
  const resolvedTenantId = normalizeTenantId(input.tenantId);
  if (!resolvedTenantId) return;
  const nextItem = buildQueueItem({
    tenantId: resolvedTenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    operationType: 'order.snapshot',
    payload: input.payload,
    source: 'pos',
    conflictStrategy: 'merge',
    dedupeKey: buildQueueKey({
      tenantId: resolvedTenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      operationType: 'order.snapshot',
    }),
  });

  void upsertQueueItem(nextItem).then(() => emitChange());
}

export function queueOfflinePaymentSnapshot(input: {
  tenantId: string;
  branchId: string;
  tableId: string;
  payload: unknown;
  paymentId?: string;
}) {
  const resolvedTenantId = normalizeTenantId(input.tenantId);
  if (!resolvedTenantId) return;
  const paymentId = input.paymentId ?? createOperationId('payment');
  const nextItem = buildQueueItem({
    id: paymentId,
    tenantId: resolvedTenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    operationType: 'payment.snapshot',
    payload: input.payload,
    source: 'pos',
    conflictStrategy: 'server-wins',
    dedupeKey: buildQueueKey({
      tenantId: resolvedTenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      operationType: 'payment.snapshot',
      scope: paymentId,
    }),
  });

  void appendQueueItem(nextItem).then(() => emitChange());
}

export function queueOfflineTableSnapshot(input: {
  tenantId: string;
  branchId: string;
  tableId: string;
  payload: unknown;
}) {
  const resolvedTenantId = normalizeTenantId(input.tenantId);
  if (!resolvedTenantId) return;
  const nextItem = buildQueueItem({
    tenantId: resolvedTenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    operationType: 'table.snapshot',
    payload: input.payload,
    source: 'pos',
    conflictStrategy: 'client-wins',
    dedupeKey: buildQueueKey({
      tenantId: resolvedTenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      operationType: 'table.snapshot',
    }),
  });

  void upsertQueueItem(nextItem).then(() => emitChange());
}

export function queueOfflinePrinterJob(input: {
  tenantId: string;
  branchId: string;
  tableId: string;
  payload: unknown;
  printerName: string;
  jobId?: string;
}) {
  const resolvedTenantId = normalizeTenantId(input.tenantId);
  if (!resolvedTenantId) return;
  const jobId = input.jobId ?? createOperationId('printer');
  const nextItem = buildQueueItem({
    id: jobId,
    tenantId: resolvedTenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    operationType: 'printer.job',
    payload: {
      printerName: input.printerName,
      data: cloneJson(input.payload),
    },
    source: 'pos',
    conflictStrategy: 'server-wins',
    dedupeKey: buildQueueKey({
      tenantId: resolvedTenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      operationType: 'printer.job',
      scope: jobId,
    }),
  });

  void appendQueueItem(nextItem).then(() => emitChange());
}

export async function syncOfflineOrders(options: { tenantId?: string | null; force?: boolean } = {}) {
  const resolvedTenantId = resolveTenantId(options.tenantId);
  if (!resolvedTenantId) return loadOfflineSyncSummary();

  const existingSync = activeSyncs.get(resolvedTenantId);
  if (existingSync) return existingSync;

  const syncTask = (async () => {
    if (!canUseStorage()) {
      return loadSummary(resolvedTenantId);
    }

    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const queue = await readAllQueueItems(resolvedTenantId);
    const pendingItems = queue.filter((item) => item.status === 'pending' || item.status === 'failed');
    if (!options.force && !online) {
      const meta = await readTenantMeta(resolvedTenantId);
      await writeTenantMeta({
        tenantId: resolvedTenantId,
        online: false,
        syncing: false,
        lastSyncAt: meta?.lastSyncAt,
        lastSyncCount: meta?.lastSyncCount ?? 0,
        lastError: meta?.lastError,
        updatedAt: new Date().toISOString(),
      });
      emitChange();
      return loadSummary(resolvedTenantId);
    }

    const startedAt = new Date().toISOString();
    await writeTenantMeta({
      tenantId: resolvedTenantId,
      online,
      syncing: true,
      lastSyncAt: (await readTenantMeta(resolvedTenantId))?.lastSyncAt,
      lastSyncCount: 0,
      updatedAt: startedAt,
    });

    if (pendingItems.length === 0) {
      await writeTenantMeta({
        tenantId: resolvedTenantId,
        online,
        syncing: false,
        lastSyncAt: startedAt,
        lastSyncCount: 0,
        updatedAt: startedAt,
      });
      emitChange();
      return loadSummary(resolvedTenantId);
    }

    const syncingQueue = queue.map((item) => (
      pendingItems.some((pending) => pending.id === item.id)
        ? { ...item, status: 'syncing' as const, attempts: item.attempts + 1, updatedAt: startedAt }
        : item
    ));
    await Promise.all(syncingQueue.map((item) => writeQueueItem(item)));

    try {
      const response = await fetch('/api/offline-sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: resolvedTenantId,
          operations: pendingItems,
        }),
      });

      if (!response.ok) {
        throw new Error(`Offline sync failed with status ${response.status}`);
      }

      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      const acceptedIds = new Set<string>(Array.isArray(payload.acceptedIds) ? payload.acceptedIds.filter((value: unknown): value is string => typeof value === 'string') : pendingItems.map((item) => item.id));
      const now = new Date().toISOString();
      const nextQueue = queue.map((item) => {
        if (!acceptedIds.has(item.id)) {
          return item.status === 'syncing'
            ? { ...item, status: 'failed' as const, lastError: 'Sunucudan onay alınamadı.', updatedAt: now }
            : item;
        }

        return {
          ...item,
          status: 'synced' as const,
          syncedAt: now,
          lastError: undefined,
          updatedAt: now,
        };
      });

      await Promise.all(nextQueue.map((item) => writeQueueItem(item)));
      const syncedCount = acceptedIds.size;
      await writeTenantMeta({
        tenantId: resolvedTenantId,
        online: true,
        syncing: false,
        lastSyncAt: now,
        lastSyncCount: syncedCount,
        updatedAt: now,
      });
      emitChange();

      return loadSummary(resolvedTenantId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Offline sync failed';
      const now = new Date().toISOString();
      const nextQueue = queue.map((item) => (
        pendingItems.some((pending) => pending.id === item.id)
          ? { ...item, status: 'failed' as const, lastError: message, updatedAt: now }
          : item
      ));

      await Promise.all(nextQueue.map((item) => writeQueueItem(item)));
      await writeTenantMeta({
        tenantId: resolvedTenantId,
        online: false,
        syncing: false,
        lastSyncAt: (await readTenantMeta(resolvedTenantId))?.lastSyncAt,
        lastSyncCount: 0,
        lastError: message,
        updatedAt: now,
      });
      emitChange();

      return loadSummary(resolvedTenantId);
    }
  })();

  activeSyncs.set(resolvedTenantId, syncTask);
  try {
    return await syncTask;
  } finally {
    activeSyncs.delete(resolvedTenantId);
  }
}

export async function clearOfflineOrderQueue(tenantId?: string) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!canUseStorage()) return;

  const database = await openQueueDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction([QUEUE_STORE, META_STORE], 'readwrite');
    const queueStore = transaction.objectStore(QUEUE_STORE);
    const metaStore = transaction.objectStore(META_STORE);

    if (resolvedTenantId) {
      queueStore.getAll().onsuccess = () => {
        const rows = Array.isArray((queueStore.getAll() as IDBRequest).result) ? (queueStore.getAll() as IDBRequest).result as OfflineQueueItem[] : [];
        rows.filter((item) => item.tenantId === resolvedTenantId).forEach((item) => queueStore.delete(item.id));
      };
      metaStore.delete(resolvedTenantId);
    } else {
      queueStore.clear();
      metaStore.clear();
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });

  emitChange();
}
