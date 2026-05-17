import { getDurableQueueMetrics, getRecentOrchestrationJobs } from '@/lib/queue/orchestration';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
  } catch (error) {
    if (isRouteResponse(error)) return error;
    throw error;
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      async function emit() {
        try {
          const [metrics, jobs] = await Promise.all([getDurableQueueMetrics(), getRecentOrchestrationJobs()]);
          controller.enqueue(encoder.encode(`event: jobs\ndata: ${JSON.stringify({ metrics, jobs, generatedAt: new Date().toISOString() })}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : 'stream failed' })}\n\n`));
        }
      }
      void emit();
      timer = setInterval(() => { void emit(); }, 3000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
