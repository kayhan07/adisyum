import { NextResponse } from 'next/server';
import { requireSystemAdmin, isRouteResponse } from '@/lib/system-admin/auth';
import { acknowledgeIncident, resolveIncident } from '@/lib/incidents/durable-incident-center';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as { action?: string; incidentId?: string; resolutionNotes?: string };
    if (!body.incidentId) return NextResponse.json({ ok: false, error: 'incidentId required' }, { status: 400 });
    if (body.action === 'acknowledge') {
      return NextResponse.json({ ok: true, incident: await acknowledgeIncident(body.incidentId, session.userId) });
    }
    if (body.action === 'resolve') {
      return NextResponse.json({ ok: true, incident: await resolveIncident(body.incidentId, session.userId, body.resolutionNotes) });
    }
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/incidents/actions] failed', error);
    return NextResponse.json({ ok: false, error: 'Incident aksiyonu uygulanamadi.' }, { status: 500 });
  }
}
