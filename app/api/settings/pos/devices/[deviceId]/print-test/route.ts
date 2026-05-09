import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const payload = await posBackendJson(`/pos/devices/${deviceId}/print-test`, {
      method: 'POST',
    }, 'POS test fişi gönderilemedi.');

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS test fişi gönderilemedi.',
    }, { status: 500 });
  }
}
