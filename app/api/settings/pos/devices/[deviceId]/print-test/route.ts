import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const tenant = await requireTenant(request);
    const { deviceId } = await params;
    const branchId = tenant.branchId ?? 'mrk';
    const body = await request.json().catch(() => ({})) as {
      printerName?: string;
      role?: string;
      printerRole?: string;
    };
    const role = body.printerRole ?? body.role ?? 'general';
    const payload = await posBackendJson(`/pos/devices/${deviceId}/print-test`, {
      method: 'POST',
      body: JSON.stringify({
        tenantId: tenant.tenantId,
        branchId,
        deviceId,
        printerName: body.printerName,
        role,
      }),
    }, 'POS test fişi gönderilemedi.');

    return NextResponse.json({
      ok: true,
      status: 'queued',
      tenantId: tenant.tenantId,
      branchId,
      deviceId,
      printerName: body.printerName ?? '',
      role,
      result: payload,
    });
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    return NextResponse.json({
      ok: false,
      status: 'failed',
      message: error instanceof Error ? error.message : 'POS test fişi gönderilemedi.',
    }, { status: 500 });
  }
}
