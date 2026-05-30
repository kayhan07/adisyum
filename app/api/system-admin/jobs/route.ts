import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  clearFailedOrchestrationJobs,
  getDurableQueueMetrics,
  getRecentOrchestrationJobs,
  retryOrchestrationJob,
  type OrchestrationQueueName,
  ORCHESTRATION_QUEUES,
} from '@/lib/queue/orchestration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isQueueName(value: string): value is OrchestrationQueueName {
  return (ORCHESTRATION_QUEUES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const [metrics, jobs] = await Promise.all([getDurableQueueMetrics(), getRecentOrchestrationJobs()]);
    return NextResponse.json({ ok: true, metrics, jobs, generatedAt: new Date().toISOString() });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/jobs] list failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Job merkezi verisi alınamadı.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as { action?: 'retry' | 'clear_failed'; queue?: string; jobId?: string };
    if (!body.queue || !isQueueName(body.queue)) {
      return NextResponse.json({ ok: false, error: 'Geçerli queue zorunludur.' }, { status: 400 });
    }
    if (body.action === 'retry') {
      if (!body.jobId) return NextResponse.json({ ok: false, error: 'jobId zorunludur.' }, { status: 400 });
      await retryOrchestrationJob(body.queue, body.jobId);
    } else if (body.action === 'clear_failed') {
      await clearFailedOrchestrationJobs(body.queue);
    } else {
      return NextResponse.json({ ok: false, error: 'Gecersiz action.' }, { status: 400 });
    }
    const [metrics, jobs] = await Promise.all([getDurableQueueMetrics(), getRecentOrchestrationJobs()]);
    return NextResponse.json({ ok: true, metrics, jobs });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/jobs] action failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Job aksiyonu başarısız.' }, { status: 500 });
  }
}
