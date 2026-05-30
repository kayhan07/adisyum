import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  buildDiagnosticSnapshot,
  buildRollbackPlan,
  COMPATIBILITY_RULES,
  releaseHealthSummary,
  ROLLOUT_PLANS,
  validateVersionCompatibility,
  VERSION_REGISTRY,
  type VersionComponent,
} from '@/lib/release-governance';
import { DEVICE_CERTIFICATION_MATRIX, certificationSummary } from '@/lib/device-certification';
import {
  autonomousOperationsSummary,
  buildAutonomousRiskSignals,
  evaluateOperationalPolicies,
  OPERATIONAL_POLICIES,
  simulateChaosScenario,
} from '@/lib/autonomous-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReleaseActionBody =
  | {
      action: 'diagnostic_snapshot';
      tenantId?: string;
      bridgeId?: string;
      installedVersions?: Partial<Record<VersionComponent, string>>;
    }
  | {
      action: 'rollback_plan';
      tenantId?: string;
      branchId?: string;
      deviceGroup?: string;
      component?: VersionComponent;
    }
  | {
      action: 'validate';
      installedVersions?: Partial<Record<VersionComponent, string>>;
    }
  | {
      action: 'simulate_chaos';
      scenario?: 'reconnect_storm' | 'rollout_corruption' | 'printer_fleet_failure' | 'offline_replay_corruption' | 'bridge_crash_loop';
    };

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      registry: VERSION_REGISTRY,
      compatibilityRules: COMPATIBILITY_RULES,
      rollouts: ROLLOUT_PLANS,
      health: releaseHealthSummary(),
      certification: {
        summary: certificationSummary(),
        matrix: DEVICE_CERTIFICATION_MATRIX,
      },
      automation: {
        policies: OPERATIONAL_POLICIES,
        decisions: evaluateOperationalPolicies(),
        summary: autonomousOperationsSummary(),
        riskSignals: buildAutonomousRiskSignals(),
      },
    });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/release-operations] list failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Release operasyon verisi alınamadı.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSystemAdmin(request);
    const body = (await request.json().catch(() => ({}))) as ReleaseActionBody;

    if (body.action === 'diagnostic_snapshot') {
      return NextResponse.json({
        ok: true,
        snapshot: buildDiagnosticSnapshot({
          tenantId: body.tenantId,
          bridgeId: body.bridgeId,
          installedVersions: body.installedVersions,
        }),
      });
    }

    if (body.action === 'rollback_plan') {
      return NextResponse.json({
        ok: true,
        rollback: buildRollbackPlan({
          tenantId: body.tenantId,
          branchId: body.branchId,
          deviceGroup: body.deviceGroup,
          component: body.component,
        }),
      });
    }

    if (body.action === 'validate') {
      return NextResponse.json({
        ok: true,
        compatibility: validateVersionCompatibility(body.installedVersions ?? {}),
      });
    }

    if (body.action === 'simulate_chaos') {
      return NextResponse.json({
        ok: true,
        chaos: simulateChaosScenario(body.scenario ?? 'reconnect_storm'),
      });
    }

    return NextResponse.json({ ok: false, error: 'Gecersiz release operasyon aksiyonu.' }, { status: 400 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/release-operations] action failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Release operasyon aksiyonu başarısız.' }, { status: 500 });
  }
}
