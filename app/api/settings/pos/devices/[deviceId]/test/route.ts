import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    await requireTenant(_request);
    const { deviceId } = await params;
    const payload = await posBackendJson(`/pos/devices/${deviceId}/test`, {
      method: 'POST',
    }, 'POS bağlantı testi başarısız oldu.');

    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS bağlantı testi başarısız oldu.',
    }, { status: 500 });
  }
}
