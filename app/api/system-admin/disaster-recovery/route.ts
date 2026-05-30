import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  buildRecoveryDecisions,
  buildRecoverySnapshot,
  disasterRecoverySummary,
  FAILURE_DOMAINS,
  REGION_HEALTH,
  simulateRecoveryScenario,
} from '@/lib/disaster-recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DisasterRecoveryAction =
  | { action: 'snapshot' }
  | { action: 'simulate_recovery'; scenario?: 'redis_outage' | 'websocket_collapse' | 'worker_crash_storm' | 'db_reconnect_storm' | 'rollout_corruption' | 'replay_corruption' | 'region_isolation' };

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: disasterRecoverySummary(),
      domains: FAILURE_DOMAINS,
      regions: REGION_HEALTH,
      decisions: buildRecoveryDecisions(),
      snapshot: buildRecoverySnapshot(),
    });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/disaster-recovery] list failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Disaster recovery verisi alınamadı.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSystemAdmin(request);
    const body = (await request.json().catch(() => ({}))) as DisasterRecoveryAction;

    if (body.action === 'snapshot') {
      return NextResponse.json({ ok: true, snapshot: buildRecoverySnapshot() });
    }

    if (body.action === 'simulate_recovery') {
      return NextResponse.json({ ok: true, recovery: simulateRecoveryScenario(body.scenario ?? 'redis_outage') });
    }

    return NextResponse.json({ ok: false, error: 'Gecersiz disaster recovery aksiyonu.' }, { status: 400 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/disaster-recovery] action failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Disaster recovery aksiyonu başarısız.' }, { status: 500 });
  }
}
