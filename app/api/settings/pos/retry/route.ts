import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireTenant(request);
    const payload = await posBackendJson('/pos/retry-failed', {
      method: 'POST',
    }, 'Başarısız POS işlemleri yeniden denenemedi.');

    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Başarısız POS işlemleri yeniden denenemedi.',
    }, { status: 500 });
  }
}
