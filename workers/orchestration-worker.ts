import { loadEnvConfig } from '@next/env';
import { Worker } from 'bullmq';
import { getQueueConnection, ORCHESTRATION_QUEUES, type OnboardingQueuePayload, type OrchestrationQueueName } from '../lib/queue/orchestration';
import { rollbackProvisioningJob, runProvisioningJob } from '../lib/system-admin/provisioning';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

async function processJob(queue: OrchestrationQueueName, name: string, data: Record<string, unknown>) {
  if (queue === 'onboarding') {
    const payload = data as OnboardingQueuePayload;
    if (name === 'provisioning.rollback' || payload.action === 'rollback') {
      await rollbackProvisioningJob(payload.provisioningJobId);
      return;
    }
    await runProvisioningJob(payload.provisioningJobId);
    return;
  }

  console.info('[orchestration-worker] noop processor completed', { queue, name, data });
}

for (const queue of ORCHESTRATION_QUEUES) {
  const worker = new Worker(queue, async (job) => processJob(queue, job.name, job.data as Record<string, unknown>), {
    prefix: 'adisyum',
    connection: getQueueConnection(),
    concurrency: queue === 'onboarding' ? 2 : 4,
    lockDuration: 60_000,
  });
  worker.on('ready', () => console.info('[orchestration-worker] ready', { queue }));
  worker.on('completed', (job) => console.info('[orchestration-worker] completed', { queue, jobId: job.id, name: job.name }));
  worker.on('failed', (job, error) => console.error('[orchestration-worker] failed', { queue, jobId: job?.id, name: job?.name, error: error.message }));
  worker.on('stalled', (jobId) => console.warn('[orchestration-worker] stalled', { queue, jobId }));
}

console.info('[orchestration-worker] booted', { queues: ORCHESTRATION_QUEUES });
