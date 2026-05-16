import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { ingestPilotDiagnostics } from '@/lib/pilot-field/field-validation';
import { isSessionActive } from '@/lib/server/session-guard';
import { logWarn } from '@/lib/observability/structured-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');

  const body = await request.json().catch(() => null) as Parameters<typeof ingestPilotDiagnostics>[0] | null;
  if (body?.tenantId && body.tenantId !== session.tenantId) {
    logWarn({
      tenantId: session.tenantId,
      service: 'pilot-field.ingest',
      message: 'Rejected tenant-mismatched pilot diagnostics',
      context: { requestedTenantId: body.tenantId, sessionTenantId: session.tenantId },
    });
    return forbiddenResponse('Tenant mismatch');
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
  }

  const result = ingestPilotDiagnostics({
    ...(body ?? { tenantId }),
    tenantId,
  });

  return NextResponse.json({
    ok: true,
    tenantId,
    accepted: result.accepted,
    ingestedAt: new Date().toISOString(),
  });
}
