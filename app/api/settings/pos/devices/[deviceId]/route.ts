import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const tenant = await requireTenant(request);
    const { deviceId } = await params;
    const body = await request.json().catch(() => ({}));
    const branchId = tenant.branchId ?? 'mrk';
    const payload = await posBackendJson(`/pos/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...body,
        tenantId: tenant.tenantId,
        branchId,
        deviceId,
      }),
    }, 'POS cihazı güncellenemedi.');

    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, branchId, deviceId, device: payload });
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : 'POS cihazı güncellenemedi.',
    }, { status: 500 });
  }
}
