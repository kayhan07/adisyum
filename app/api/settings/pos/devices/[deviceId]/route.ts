import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const payload = await posBackendJson(`/pos/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, 'POS cihazı güncellenemedi.');

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS cihazı güncellenemedi.',
    }, { status: 500 });
  }
}
