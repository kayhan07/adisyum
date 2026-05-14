/**
 * ADISYUM Enterprise Queue System
 * In-memory distributed queue with retry, dead-letter, tenant isolation,
 * priority scheduling, and queue metrics.
 * Zero external dependencies — Redis-backed migration path ready.
 */

import { triggerDeadQueueClean, triggerJobRetry } from '@/lib/self-healing/engine';
import { logInfo, logWarn, logError } from '@/lib/observability/structured-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueName =
  | 'print'
  | 'sync'
  | 'audit'
  | 'report'
  | 'notification'
  | 'analytics';

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export type QueueJob<T = unknown> = {
  id: string;
  queue: QueueName;
  tenantId?: string;
  priority: JobPriority;
  status: JobStatus;
  payload: T;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processAt: string;
  processedAt?: string;
  failedAt?: string;
  lastError?: string;
  deadAt?: string;
};

export type QueueMetrics = {
  queue: QueueName;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  throughputLastMinute: number;
};

type QueueStore = {
  jobs: Record<QueueName, QueueJob[]>;
  completedCounts: Record<QueueName, number>;
  recentCompletions: Array<{ queue: QueueName; at: number }>;
  processors: Record<QueueName, ((job: QueueJob) => Promise<void>) | null>;
  timers: Record<QueueName, ReturnType<typeof setInterval> | null>;
};

// ─── Singleton ────────────────────────────────────────────────────────────────

const MAX_JOBS_PER_QUEUE = 2000;
const MAX_DEAD_JOBS = 500;

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const g = globalThis as typeof globalThis & {
  __adisyumQueue?: QueueStore;
};

function getStore(): QueueStore {
  if (!g.__adisyumQueue) {
    const queues: QueueName[] = ['print', 'sync', 'audit', 'report', 'notification', 'analytics'];
    const jobs = {} as Record<QueueName, QueueJob[]>;
    const completedCounts = {} as Record<QueueName, number>;
    const processors = {} as Record<QueueName, ((job: QueueJob) => Promise<void>) | null>;
    const timers = {} as Record<QueueName, ReturnType<typeof setInterval> | null>;

    for (const q of queues) {
      jobs[q] = [];
      completedCounts[q] = 0;
      processors[q] = null;
      timers[q] = null;
    }

    g.__adisyumQueue = { jobs, completedCounts, recentCompletions: [], processors, timers };
  }
  return g.__adisyumQueue;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function nowIso() { return new Date().toISOString(); }

function sortByPriority(jobs: QueueJob[]): QueueJob[] {
  return [...jobs].sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export function enqueue<T>(input: {
  queue: QueueName;
  tenantId?: string;
  payload: T;
  priority?: JobPriority;
  maxAttempts?: number;
  delayMs?: number;
}): QueueJob<T> {
  const store = getStore();
  const queueJobs = store.jobs[input.queue];

  const job: QueueJob<T> = {
    id: uid(),
    queue: input.queue,
    tenantId: input.tenantId,
    priority: input.priority ?? 'normal',
    status: 'pending',
    payload: input.payload,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: nowIso(),
    processAt: new Date(Date.now() + (input.delayMs ?? 0)).toISOString(),
  };

  queueJobs.push(job);

  // Enforce max queue size (drop lowest priority pending)
  if (queueJobs.length > MAX_JOBS_PER_QUEUE) {
    const pending = queueJobs.filter((j) => j.status === 'pending');
    const sorted = sortByPriority(pending);
    const toDrop = sorted[sorted.length - 1];
    if (toDrop) {
      toDrop.status = 'dead';
      toDrop.deadAt = nowIso();
      toDrop.lastError = 'Queue overflow: dropped lowest priority job';
      logWarn({ service: 'queue', tenantId: input.tenantId, message: `Queue overflow on '${input.queue}' — dropped job ${toDrop.id}` });
    }
  }

  return job;
}

// ─── Process ──────────────────────────────────────────────────────────────────

export async function processNext(queue: QueueName): Promise<boolean> {
  const store = getStore();
  const processor = store.processors[queue];
  if (!processor) return false;

  const now = Date.now();
  const pending = sortByPriority(
    store.jobs[queue].filter((j) => j.status === 'pending' && new Date(j.processAt).getTime() <= now),
  );

  if (!pending.length) return false;
  const job = pending[0];

  job.status = 'processing';
  job.attempts += 1;

  try {
    await processor(job);
    job.status = 'completed';
    job.processedAt = nowIso();
    store.completedCounts[queue] = (store.completedCounts[queue] ?? 0) + 1;
    store.recentCompletions.push({ queue, at: Date.now() });
    // Trim completions older than 60s
    const cutoff = Date.now() - 60000;
    store.recentCompletions = store.recentCompletions.filter((c) => c.at > cutoff);
    return true;
  } catch (err) {
    job.lastError = String(err);

    if (job.attempts >= job.maxAttempts) {
      job.status = 'dead';
      job.deadAt = nowIso();
      logError({
        service: 'queue',
        tenantId: job.tenantId,
        message: `Job ${job.id} on '${queue}' moved to dead queue after ${job.attempts} attempts: ${job.lastError}`,
      });

      // Check dead queue overflow
      const deadCount = store.jobs[queue].filter((j) => j.status === 'dead').length;
      if (deadCount > 100 && job.tenantId) {
        triggerDeadQueueClean(job.tenantId, queue, deadCount);
      }
    } else {
      const canRetry = triggerJobRetry(job.tenantId ?? 'system', `${queue}:job`, job.attempts, job.lastError);
      if (canRetry) {
        job.status = 'pending';
        // Exponential backoff
        job.processAt = new Date(Date.now() + Math.pow(2, job.attempts) * 5000).toISOString();
      } else {
        job.status = 'dead';
        job.deadAt = nowIso();
      }
    }
    return false;
  }
}

// ─── Register Processor ───────────────────────────────────────────────────────

export function registerProcessor(queue: QueueName, processor: (job: QueueJob) => Promise<void>, intervalMs = 1000) {
  const store = getStore();
  store.processors[queue] = processor;

  // Clear existing timer
  const existing = store.timers[queue];
  if (existing) clearInterval(existing);

  if (typeof setInterval === 'undefined') return;

  const timer = setInterval(async () => {
    try {
      await processNext(queue);
    } catch (err) {
      logError({ service: 'queue', message: `Queue processor error [${queue}]: ${String(err)}` });
    }
  }, intervalMs);

  if (typeof timer?.unref === 'function') timer.unref();
  store.timers[queue] = timer;
  logInfo({ service: 'queue', message: `Queue processor registered: ${queue} (interval ${intervalMs}ms)` });
}

// ─── Dead Letter Queue Management ─────────────────────────────────────────────

export function clearDeadLetterQueue(queue: QueueName, tenantId?: string): number {
  const store = getStore();
  const jobs = store.jobs[queue];
  const before = jobs.length;

  const keep = jobs.filter((j) => {
    if (j.status !== 'dead') return true;
    if (tenantId && j.tenantId !== tenantId) return true;
    return false;
  });

  // Keep recent dead jobs (last MAX_DEAD_JOBS)
  const recentDead = jobs.filter((j) => j.status === 'dead').slice(-MAX_DEAD_JOBS);
  store.jobs[queue] = [...keep.filter((j) => j.status !== 'dead'), ...recentDead];

  const cleared = before - store.jobs[queue].length;
  if (cleared > 0) {
    logInfo({ service: 'queue', tenantId, message: `Dead letter queue '${queue}' cleared: ${cleared} jobs removed` });
  }
  return cleared;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export function getQueueMetrics(): QueueMetrics[] {
  const store = getStore();
  const queues: QueueName[] = ['print', 'sync', 'audit', 'report', 'notification', 'analytics'];
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  return queues.map((queue) => {
    const jobs = store.jobs[queue];
    const recentCompletions = store.recentCompletions.filter((c) => c.queue === queue && c.at > oneMinuteAgo).length;

    return {
      queue,
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: store.completedCounts[queue] ?? 0,
      failed: jobs.filter((j) => j.status === 'failed').length,
      dead: jobs.filter((j) => j.status === 'dead').length,
      throughputLastMinute: recentCompletions,
    };
  });
}

export function getQueueJobsByTenant(tenantId: string, queue?: QueueName): QueueJob[] {
  const store = getStore();
  const queues: QueueName[] = queue ? [queue] : ['print', 'sync', 'audit', 'report', 'notification', 'analytics'];
  return queues.flatMap((q) => store.jobs[q].filter((j) => j.tenantId === tenantId));
}

export function getTotalQueueDepth(): number {
  const store = getStore();
  return Object.values(store.jobs).flat().filter((j) => j.status === 'pending').length;
}
