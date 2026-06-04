import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json().catch(() => ({}));
    const branchId = tenant.branchId ?? 'mrk';
    const payload = await posBackendJson('/pos/devices', {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        tenantId: tenant.tenantId,
        branchId,
      }),
    }, 'POS cihazı kaydedilemedi.');

    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, branchId, device: payload }, { status: 201 });
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : 'POS cihazı kaydedilemedi.',
    }, { status: 500 });
  }
}
