import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import { previewTenantBusinessDataReset } from '@/lib/system-admin/provisioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requireSystemAdmin(request);
    if (isRouteResponse(admin)) return admin;
    const { tenantId } = await context.params;
    const url = new URL(request.url);
    const modules = url.searchParams.get('modules')?.split(',').map((module) => module.trim()).filter(Boolean) ?? [];
    const preview = await previewTenantBusinessDataReset(tenantId, modules);
    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    console.error('[system-admin/tenant-reset-preview] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Tenant veri önizlemesi alınamadı.' }, { status: 400 });
  }
}
