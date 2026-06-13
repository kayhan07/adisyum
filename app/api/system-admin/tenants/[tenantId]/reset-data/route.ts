import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import { previewTenantBusinessDataReset, resetTenantBusinessData, type TenantDataResetModule } from '@/lib/system-admin/provisioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requireSystemAdmin(request);
    if (isRouteResponse(admin)) return admin;
    const { tenantId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      modules?: TenantDataResetModule[];
      confirmationTenantId?: string;
      dryRun?: boolean;
    };
    if (body.dryRun) {
      const preview = await previewTenantBusinessDataReset(tenantId, body.modules ?? []);
      return NextResponse.json({ ok: true, ...preview });
    }
    const reset = await resetTenantBusinessData({
      action: 'reset_tenant_data',
      tenantId,
      confirmationTenantId: body.confirmationTenantId ?? '',
      modules: body.modules,
      requestedBy: admin.userId,
    });
    return NextResponse.json({ ok: true, tenantId, modules: reset.modules, deletedCounts: reset.deleted, resetAt: reset.resetAt });
  } catch (error) {
    console.error('[system-admin/tenant-reset-data] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Tenant verisi temizlenemedi.' }, { status: 400 });
  }
}
