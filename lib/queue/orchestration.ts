import { Job, Queue } from 'bullmq';
import IORedis from 'ioredis';

export const ORCHESTRATION_QUEUES = [
  'onboarding',
  'template-import',
  'analytics',
  'stock-recalculation',
  'report-generation',
  'observability-aggregation',
  'ai-task',
  'notification',
] as const;

export type OrchestrationQueueName = typeof ORCHESTRATION_QUEUES[number];
export type OrchestrationJobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
export type OnboardingQueuePayload = {
  action: 'run' | 'rollback';
  provisioningJobId: string;
  tenantId: string;
  requestedBy: string;
};

type QueueRegistry = Partial<Record<OrchestrationQueueName, Queue>>;
type GlobalQueueState = typeof globalThis & {
  __adisyumRedisConnection?: IORedis;
  __adisyumOrchestrationQueues?: QueueRegistry;
};

const globalQueueState = globalThis as GlobalQueueState;

function requireRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for durable orchestration queues.');
  }
  return redisUrl;
}

export function getQueueConnection() {
  if (!globalQueueState.__adisyumRedisConnection) {
    globalQueueState.__adisyumRedisConnection = new IORedis(requireRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }
  return globalQueueState.__adisyumRedisConnection;
}

export function getOrchestrationQueue(name: OrchestrationQueueName) {
  if (!globalQueueState.__adisyumOrchestrationQueues) {
    globalQueueState.__adisyumOrchestrationQueues = {};
  }
  const current = globalQueueState.__adisyumOrchestrationQueues[name];
  if (current) return current;
  const queue = new Queue(name, {
    prefix: 'adisyum',
    connection: getQueueConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 500 },
      removeOnFail: { age: 60 * 60 * 24 * 14, count: 1_000 },
    },
  });
  globalQueueState.__adisyumOrchestrationQueues[name] = queue;
  return queue;
}

export async function enqueueOrchestrationJob<T extends Record<string, unknown>>(input: {
  queue: OrchestrationQueueName;
  name: string;
  payload: T;
  tenantId?: string;
  jobId?: string;
}) {
  const queue = getOrchestrationQueue(input.queue);
  return queue.add(input.name, input.payload, {
    jobId: input.jobId,
    priority: input.queue === 'onboarding' ? 1 : undefined,
  });
}

export async function enqueueProvisioningRun(payload: OnboardingQueuePayload) {
  return enqueueOrchestrationJob({
    queue: 'onboarding',
    name: payload.action === 'rollback' ? 'provisioning.rollback' : 'provisioning.run',
    payload,
    tenantId: payload.tenantId,
    jobId: `${payload.action}-${payload.provisioningJobId}`,
  });
}

async function queueMetric(name: OrchestrationQueueName) {
  const queue = getOrchestrationQueue(name);
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
  const failedJobs = await queue.getFailed(0, 99);
  const dead = failedJobs.filter((job) => job.attemptsMade >= Number(job.opts.attempts ?? 1)).length;
  return {
    queue: name,
    waiting: counts.waiting ?? 0,
    pending: counts.waiting ?? 0,
    active: counts.active ?? 0,
    processing: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
    dead,
  };
}

export async function getDurableQueueMetrics() {
  return Promise.all(ORCHESTRATION_QUEUES.map(queueMetric));
}

function serializeJob(queue: OrchestrationQueueName, job: Job, status: OrchestrationJobStatus) {
  const data = job.data as Record<string, unknown>;
  return {
    id: job.id ?? '',
    queue,
    name: job.name,
    status,
    tenantId: typeof data.tenantId === 'string' ? data.tenantId : null,
    provisioningJobId: typeof data.provisioningJobId === 'string' ? data.provisioningJobId : null,
    attemptsMade: job.attemptsMade,
    maxAttempts: Number(job.opts.attempts ?? 1),
    failedReason: job.failedReason ?? null,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
  };
}

export async function getRecentOrchestrationJobs() {
  const rows = await Promise.all(ORCHESTRATION_QUEUES.map(async (queueName) => {
    const queue = getOrchestrationQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(0, 19),
      queue.getActive(0, 19),
      queue.getCompleted(0, 19),
      queue.getFailed(0, 19),
      queue.getDelayed(0, 19),
    ]);
    return [
      ...waiting.map((job) => serializeJob(queueName, job, 'waiting')),
      ...active.map((job) => serializeJob(queueName, job, 'active')),
      ...completed.map((job) => serializeJob(queueName, job, 'completed')),
      ...failed.map((job) => serializeJob(queueName, job, 'failed')),
      ...delayed.map((job) => serializeJob(queueName, job, 'delayed')),
    ];
  }));
  return rows.flat().sort((left, right) => right.timestamp - left.timestamp).slice(0, 250);
}

export async function retryOrchestrationJob(queueName: OrchestrationQueueName, jobId: string) {
  const job = await getOrchestrationQueue(queueName).getJob(jobId);
  if (!job) throw new Error('Queue job bulunamadi.');
  await job.retry('failed');
  return job;
}

export async function clearFailedOrchestrationJobs(queueName: OrchestrationQueueName) {
  const queue = getOrchestrationQueue(queueName);
  const failed = await queue.getFailed(0, 999);
  await Promise.all(failed.map((job) => job.remove()));
  return failed.length;
}
