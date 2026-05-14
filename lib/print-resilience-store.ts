'use client';

import { fetchLocalAgentJson } from '@/lib/local-agent';
import { loadSessionState } from '@/lib/session-store';

export type PrintTicketType = 'customer' | 'kitchen' | 'bar';
export type PrintJobStatus = 'pending' | 'printing' | 'acked' | 'failed';

export type PrintQueueItem = {
  id: string;
  tenantId: string;
  branchId: string;
  tableId: string;
  printerName: string;
  ticketType: PrintTicketType;
  payloadBase64: string;
  payloadHash: string;
  dedupeKey: string;
  source: string;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  lastError?: string;
  ackAt?: string;
  ackId?: string;
  createdAt: string;
  updatedAt: string;
};

type PrinterHeartbeat = {
  id: string;
  tenantId: string;
  printerName: string;
  online: boolean;
  failureCount: number;
  lastHeartbeatAt?: string;
  lastError?: string;
  updatedAt: string;
};

type PrintTenantMeta = {
  tenantId: string;
  online: boolean;
  processing: boolean;
  lastProcessedAt?: string;
  lastError?: string;
  updatedAt: string;
};

export type PrintResilienceSummary = {
  tenantId: string;
  online: boolean;
  processing: boolean;
  pending: number;
  printing: number;
  failed: number;
  acked: number;
  retryQueue: number;
  total: number;
  lastProcessedAt?: string;
  lastError?: string;
  jobs: PrintQueueItem[];
  printers: Array<{
    printerName: string;
    online: boolean;
    failureCount: number;
    lastHeartbeatAt?: string;
    lastError?: string;
  }>;
};

const EVENT_NAME = 'adisyon-print-resilience:changed';
const DB_NAME = 'adisyum-print-resilience';
const DB_VERSION = 1;
const QUEUE_STORE = 'print_queue';
const HEARTBEAT_STORE = 'printer_heartbeat';
const META_STORE = 'print_meta';
const processorByTenant = new Map<string, Promise<PrintResilienceSummary>>();

const MAX_PARALLEL_PRINTS = 2;
const MAX_BATCH_SIZE = 20;
const MAX_ACK_HISTORY = 300;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

function normalizeTenantId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveTenantId(preferredTenantId?: string | null) {
  const preferred = normalizeTenantId(preferredTenantId);
  if (preferred) return preferred;
  return normalizeTenantId(loadSessionState().tenantId);
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function computeBackoffMs(attempts: number) {
  const base = 1200;
  const max = 60_000;
  return Math.min(max, base * (2 ** Math.max(0, attempts - 1)));
}

function safeNowIso() {
  return new Date().toISOString();
}

async function openDb() {
  if (!canUseStorage()) return null;

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('tenantId', 'tenantId', { unique: false });
        queueStore.createIndex('tenantStatus', ['tenantId', 'status'], { unique: false });
        queueStore.createIndex('dedupeKey', 'dedupeKey', { unique: false });
      }

      if (!database.objectStoreNames.contains(HEARTBEAT_STORE)) {
        const heartbeatStore = database.createObjectStore(HEARTBEAT_STORE, { keyPath: 'id' });
        heartbeatStore.createIndex('tenantId', 'tenantId', { unique: false });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'tenantId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readTenantJobs(tenantId: string) {
  const database = await openDb();
  if (!database) return [] as PrintQueueItem[];

  return new Promise<PrintQueueItem[]>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readonly');
    const request = transaction.objectStore(QUEUE_STORE).getAll();

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result as PrintQueueItem[] : [];
      resolve(
        rows
          .filter((row) => row.tenantId === tenantId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt, 'tr')),
      );
    };

    request.onerror = () => resolve([]);
  });
}

async function writeJob(item: PrintQueueItem) {
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function deleteJob(id: string) {
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(QUEUE_STORE, 'readwrite');
    transaction.objectStore(QUEUE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function readTenantHeartbeats(tenantId: string) {
  const database = await openDb();
  if (!database) return [] as PrinterHeartbeat[];

  return new Promise<PrinterHeartbeat[]>((resolve) => {
    const transaction = database.transaction(HEARTBEAT_STORE, 'readonly');
    const request = transaction.objectStore(HEARTBEAT_STORE).getAll();

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result as PrinterHeartbeat[] : [];
      resolve(rows.filter((row) => row.tenantId === tenantId));
    };

    request.onerror = () => resolve([]);
  });
}

async function writeHeartbeat(state: PrinterHeartbeat) {
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(HEARTBEAT_STORE, 'readwrite');
    transaction.objectStore(HEARTBEAT_STORE).put(state);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function readTenantMeta(tenantId: string) {
  const database = await openDb();
  if (!database) return null;

  return new Promise<PrintTenantMeta | null>((resolve) => {
    const transaction = database.transaction(META_STORE, 'readonly');
    const request = transaction.objectStore(META_STORE).get(tenantId);
    request.onsuccess = () => resolve((request.result as PrintTenantMeta | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function writeTenantMeta(meta: PrintTenantMeta) {
  const database = await openDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(meta);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function buildSummary(tenantId: string, jobs: PrintQueueItem[], heartbeats: PrinterHeartbeat[], meta: PrintTenantMeta | null): PrintResilienceSummary {
  const pending = jobs.filter((job) => job.status === 'pending').length;
  const printing = jobs.filter((job) => job.status === 'printing').length;
  const failed = jobs.filter((job) => job.status === 'failed').length;
  const acked = jobs.filter((job) => job.status === 'acked').length;

  return {
    tenantId,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    processing: meta?.processing ?? printing > 0,
    pending,
    printing,
    failed,
    acked,
    retryQueue: pending + failed,
    total: jobs.length,
    lastProcessedAt: meta?.lastProcessedAt,
    lastError: meta?.lastError,
    jobs,
    printers: heartbeats
      .sort((left, right) => left.printerName.localeCompare(right.printerName, 'tr'))
      .map((state) => ({
        printerName: state.printerName,
        online: state.online,
        failureCount: state.failureCount,
        lastHeartbeatAt: state.lastHeartbeatAt,
        lastError: state.lastError,
      })),
  };
}

async function loadTenantSummary(tenantId: string) {
  const [jobs, heartbeats, meta] = await Promise.all([
    readTenantJobs(tenantId),
    readTenantHeartbeats(tenantId),
    readTenantMeta(tenantId),
  ]);
  return buildSummary(tenantId, jobs, heartbeats, meta);
}

export async function loadPrintResilienceSummary(tenantId?: string) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) {
    return {
      tenantId: '',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      processing: false,
      pending: 0,
      printing: 0,
      failed: 0,
      acked: 0,
      retryQueue: 0,
      total: 0,
      jobs: [],
      printers: [],
    } satisfies PrintResilienceSummary;
  }

  return loadTenantSummary(resolvedTenantId);
}

export function subscribeToPrintResilienceChanges(callback: () => void) {
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

function createDedupeKey(input: {
  tenantId: string;
  branchId: string;
  tableId: string;
  printerName: string;
  ticketType: PrintTicketType;
  orderId?: string;
  payloadHash: string;
}) {
  return [
    input.tenantId,
    input.branchId,
    input.tableId,
    input.printerName,
    input.ticketType,
    input.orderId ?? 'unknown-order',
    input.payloadHash,
  ].join('::');
}

function normalizePrinterName(name: string) {
  return String(name ?? '').trim();
}

export async function queuePrintJob(input: {
  tenantId?: string | null;
  branchId?: string | null;
  tableId?: string | null;
  orderId?: string | null;
  printerName: string;
  ticketType: PrintTicketType;
  bytesBase64: string;
  source: string;
  maxAttempts?: number;
}) {
  const resolvedTenantId = resolveTenantId(input.tenantId);
  if (!resolvedTenantId) {
    return { queued: false as const, deduped: false as const, reason: 'TENANT_NOT_FOUND' as const };
  }

  const printerName = normalizePrinterName(input.printerName);
  const bytesBase64 = String(input.bytesBase64 ?? '');
  if (!printerName || !bytesBase64) {
    return { queued: false as const, deduped: false as const, reason: 'INVALID_PAYLOAD' as const };
  }

  const payloadHash = hashString(bytesBase64);
  const dedupeKey = createDedupeKey({
    tenantId: resolvedTenantId,
    branchId: String(input.branchId ?? ''),
    tableId: String(input.tableId ?? ''),
    printerName,
    ticketType: input.ticketType,
    orderId: normalizeTenantId(input.orderId) ?? undefined,
    payloadHash,
  });

  const now = safeNowIso();
  const recentJobs = await readTenantJobs(resolvedTenantId);
  const duplicate = recentJobs.find((job) => {
    if (job.dedupeKey !== dedupeKey) return false;
    if (job.status === 'pending' || job.status === 'printing') return true;
    if (job.status !== 'acked' || !job.ackAt) return false;
    return (Date.now() - new Date(job.ackAt).getTime()) < 120_000;
  });

  if (duplicate) {
    return { queued: true as const, deduped: true as const, jobId: duplicate.id };
  }

  const item: PrintQueueItem = {
    id: createId('print-job'),
    tenantId: resolvedTenantId,
    branchId: String(input.branchId ?? ''),
    tableId: String(input.tableId ?? ''),
    printerName,
    ticketType: input.ticketType,
    payloadBase64: bytesBase64,
    payloadHash,
    dedupeKey,
    source: String(input.source ?? 'receipt-formatter'),
    status: 'pending',
    attempts: 0,
    maxAttempts: Number.isFinite(input.maxAttempts) ? Math.max(1, Math.floor(input.maxAttempts as number)) : 8,
    createdAt: now,
    updatedAt: now,
  };

  await writeJob(item);
  await writeHeartbeat({
    id: `${resolvedTenantId}::${printerName}`,
    tenantId: resolvedTenantId,
    printerName,
    online: true,
    failureCount: 0,
    updatedAt: now,
  });

  emitChange();

  if (typeof navigator === 'undefined' || navigator.onLine) {
    void processPrintQueue({ tenantId: resolvedTenantId, reason: 'queue.append' });
  }

  return { queued: true as const, deduped: false as const, jobId: item.id };
}

async function updatePrinterState(
  tenantId: string,
  printerName: string,
  next: Partial<Omit<PrinterHeartbeat, 'id' | 'tenantId' | 'printerName'>>,
) {
  const now = safeNowIso();
  const current = (await readTenantHeartbeats(tenantId)).find((item) => item.printerName === printerName);

  const state: PrinterHeartbeat = {
    id: `${tenantId}::${printerName}`,
    tenantId,
    printerName,
    online: next.online ?? current?.online ?? true,
    failureCount: next.failureCount ?? current?.failureCount ?? 0,
    lastHeartbeatAt: next.lastHeartbeatAt ?? current?.lastHeartbeatAt,
    lastError: next.lastError,
    updatedAt: now,
  };

  await writeHeartbeat(state);
}

async function printSingleJob(job: PrintQueueItem) {
  await fetchLocalAgentJson('/print', {
    method: 'POST',
    body: {
      printerName: job.printerName,
      bytesBase64: job.payloadBase64,
      source: `print-resilience:${job.source}`,
      requestId: job.id,
      mode: 'raw',
    },
  });
}

function splitIntoChunks<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function processPrintQueue(options: { tenantId?: string | null; force?: boolean; reason?: string } = {}) {
  const resolvedTenantId = resolveTenantId(options.tenantId);
  if (!resolvedTenantId) {
    return loadPrintResilienceSummary();
  }

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online && !options.force) {
    const now = safeNowIso();
    await writeTenantMeta({
      tenantId: resolvedTenantId,
      online: false,
      processing: false,
      lastProcessedAt: (await readTenantMeta(resolvedTenantId))?.lastProcessedAt,
      lastError: 'Ağ çevrimdışı, yazdırma kuyruğu bekletildi.',
      updatedAt: now,
    });
    emitChange();
    return loadTenantSummary(resolvedTenantId);
  }

  const active = processorByTenant.get(resolvedTenantId);
  if (active) return active;

  const task = (async () => {
    const now = safeNowIso();
    await writeTenantMeta({
      tenantId: resolvedTenantId,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      processing: true,
      lastProcessedAt: (await readTenantMeta(resolvedTenantId))?.lastProcessedAt,
      updatedAt: now,
    });

    const allJobs = await readTenantJobs(resolvedTenantId);
    const readyJobs = allJobs
      .filter((job) => {
        if (job.status !== 'pending' && job.status !== 'failed') return false;
        if (!job.nextRetryAt) return true;
        return options.force || new Date(job.nextRetryAt).getTime() <= Date.now();
      })
      .slice(0, MAX_BATCH_SIZE);

    if (readyJobs.length === 0) {
      const idleNow = safeNowIso();
      await writeTenantMeta({
        tenantId: resolvedTenantId,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        processing: false,
        lastProcessedAt: idleNow,
        updatedAt: idleNow,
      });
      emitChange();
      return loadTenantSummary(resolvedTenantId);
    }

    const chunks = splitIntoChunks(readyJobs, MAX_PARALLEL_PRINTS);

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (job) => {
        const printStartedAt = safeNowIso();
        await writeJob({
          ...job,
          status: 'printing',
          attempts: job.attempts + 1,
          updatedAt: printStartedAt,
          lastError: undefined,
        });

        try {
          await printSingleJob(job);
          const ackAt = safeNowIso();
          await writeJob({
            ...job,
            status: 'acked',
            attempts: job.attempts + 1,
            ackAt,
            ackId: createId('ack'),
            nextRetryAt: undefined,
            lastError: undefined,
            updatedAt: ackAt,
          });
          await updatePrinterState(resolvedTenantId, job.printerName, {
            online: true,
            failureCount: 0,
            lastHeartbeatAt: ackAt,
            lastError: undefined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Print failed';
          const failedAt = safeNowIso();
          const attempts = job.attempts + 1;
          const retryAt = new Date(Date.now() + computeBackoffMs(attempts)).toISOString();

          await writeJob({
            ...job,
            status: 'failed',
            attempts,
            lastError: message,
            nextRetryAt: attempts >= job.maxAttempts ? undefined : retryAt,
            updatedAt: failedAt,
          });

          const previous = (await readTenantHeartbeats(resolvedTenantId)).find((item) => item.printerName === job.printerName);
          const nextFailureCount = (previous?.failureCount ?? 0) + 1;
          await updatePrinterState(resolvedTenantId, job.printerName, {
            online: nextFailureCount < 2,
            failureCount: nextFailureCount,
            lastHeartbeatAt: failedAt,
            lastError: message,
          });
        }
      }));
    }

    const allAfter = await readTenantJobs(resolvedTenantId);
    const ackedOverflow = allAfter
      .filter((job) => job.status === 'acked')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt, 'tr'))
      .slice(MAX_ACK_HISTORY);

    await Promise.all(ackedOverflow.map((job) => deleteJob(job.id)));

    const completedAt = safeNowIso();
    await writeTenantMeta({
      tenantId: resolvedTenantId,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      processing: false,
      lastProcessedAt: completedAt,
      lastError: undefined,
      updatedAt: completedAt,
    });
    emitChange();

    return loadTenantSummary(resolvedTenantId);
  })().catch(async (error) => {
    const failedAt = safeNowIso();
    await writeTenantMeta({
      tenantId: resolvedTenantId,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      processing: false,
      lastProcessedAt: failedAt,
      lastError: error instanceof Error ? error.message : 'Print processor failed',
      updatedAt: failedAt,
    });
    emitChange();
    return loadTenantSummary(resolvedTenantId);
  });

  processorByTenant.set(resolvedTenantId, task);

  try {
    return await task;
  } finally {
    processorByTenant.delete(resolvedTenantId);
  }
}

export async function retryFailedPrintJobs(tenantId?: string | null) {
  return processPrintQueue({ tenantId, force: true, reason: 'manual.retry' });
}

export async function reprintFailedJob(jobId: string, tenantId?: string | null) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return loadPrintResilienceSummary();

  const jobs = await readTenantJobs(resolvedTenantId);
  const found = jobs.find((job) => job.id === jobId);
  if (!found) return loadTenantSummary(resolvedTenantId);

  const now = safeNowIso();
  await writeJob({
    ...found,
    id: createId('print-job-reprint'),
    status: 'pending',
    attempts: 0,
    lastError: undefined,
    nextRetryAt: undefined,
    createdAt: now,
    updatedAt: now,
  });
  emitChange();

  return processPrintQueue({ tenantId: resolvedTenantId, force: true, reason: 'manual.reprint' });
}

export async function clearAckedPrintJobs(tenantId?: string | null) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return;

  const jobs = await readTenantJobs(resolvedTenantId);
  const acked = jobs.filter((job) => job.status === 'acked');
  await Promise.all(acked.map((job) => deleteJob(job.id)));
  emitChange();
}

export async function runPrinterHeartbeat(options: { tenantId?: string | null; printerNames?: string[] } = {}) {
  const resolvedTenantId = resolveTenantId(options.tenantId);
  if (!resolvedTenantId) return loadPrintResilienceSummary();

  const now = safeNowIso();
  const jobs = await readTenantJobs(resolvedTenantId);
  const known = new Set<string>([
    ...jobs.map((job) => job.printerName),
    ...(options.printerNames ?? []).map((name) => normalizePrinterName(name)).filter(Boolean),
  ]);

  if (known.size === 0) {
    return loadTenantSummary(resolvedTenantId);
  }

  try {
    const { data } = await fetchLocalAgentJson<{ printers?: Array<string | { Name?: string; name?: string }> }>('/printers');
    const listed = new Set(
      Array.isArray(data?.printers)
        ? data.printers.map((item) => (typeof item === 'string' ? item : (item.Name ?? item.name ?? ''))).filter((item) => item.trim().length > 0)
        : [],
    );

    await Promise.all(Array.from(known).map(async (printerName) => {
      const online = listed.has(printerName);
      await updatePrinterState(resolvedTenantId, printerName, {
        online,
        failureCount: online ? 0 : 1,
        lastHeartbeatAt: now,
        lastError: online ? undefined : 'Heartbeat printer listesinde bulunamadı.',
      });
    }));

    emitChange();

    if (Array.from(known).some((printer) => listed.has(printer))) {
      void processPrintQueue({ tenantId: resolvedTenantId, reason: 'heartbeat.online' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Heartbeat failed';
    await Promise.all(Array.from(known).map(async (printerName) => {
      const current = (await readTenantHeartbeats(resolvedTenantId)).find((item) => item.printerName === printerName);
      await updatePrinterState(resolvedTenantId, printerName, {
        online: false,
        failureCount: (current?.failureCount ?? 0) + 1,
        lastHeartbeatAt: now,
        lastError: message,
      });
    }));
    emitChange();
  }

  return loadTenantSummary(resolvedTenantId);
}
