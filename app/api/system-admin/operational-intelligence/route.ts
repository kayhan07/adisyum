import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import { buildAllTenantOperationalHealth } from '@/lib/operational-intelligence/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const tenants = await buildAllTenantOperationalHealth();
    return NextResponse.json({
      ok: true,
      tenants,
      summary: {
        averageHealth: tenants.length ? Math.round(tenants.reduce((sum, tenant) => sum + tenant.healthScore, 0) / tenants.length) : 100,
        unhealthyTenants: tenants.filter((tenant) => tenant.healthScore < 70).length,
        criticalAlerts: tenants.reduce((sum, tenant) => sum + tenant.alerts.filter((alert) => alert.severity === 'critical').length, 0),
        highAlerts: tenants.reduce((sum, tenant) => sum + tenant.alerts.filter((alert) => alert.severity === 'high').length, 0),
      },
    });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/operational-intelligence] failed', error);
    return NextResponse.json({ ok: false, error: 'Operasyon zekası alınamadı.' }, { status: 500 });
  }
}
