import { NextResponse } from 'next/server';
import { requireSystemAdmin, isRouteResponse } from '@/lib/system-admin/auth';
import { buildIncidentSummary, getIncidentWithTimeline, listIncidents } from '@/lib/incidents/durable-incident-center';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const url = new URL(request.url);
    const incidentId = url.searchParams.get('incidentId');
    if (incidentId) {
      return NextResponse.json({ ok: true, incident: await getIncidentWithTimeline(incidentId) });
    }
    const tenantId = url.searchParams.get('tenantId') ?? undefined;
    const status = url.searchParams.get('status') as 'open' | 'acknowledged' | 'escalated' | 'resolved' | null;
    const [summary, incidents] = await Promise.all([
      buildIncidentSummary(),
      listIncidents({ tenantId, status: status ?? undefined }),
    ]);
    return NextResponse.json({ ok: true, summary, incidents });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/incidents] failed', error);
    return NextResponse.json({ ok: false, error: 'Incident verisi alinamadi.' }, { status: 500 });
  }
}
