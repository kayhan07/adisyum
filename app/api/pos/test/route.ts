import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
    const action = body?.action === 'print' ? 'print' : 'connection';

    if (!deviceId) {
      return NextResponse.json({ message: 'Device id is required.' }, { status: 400 });
    }

    const payload = await posBackendJson(
      action === 'print' ? `/pos/devices/${deviceId}/print-test` : `/pos/devices/${deviceId}/test`,
      { method: 'POST' },
      action === 'print' ? 'Test receipt could not be printed.' : 'Connection test failed.',
    );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS test failed.',
    }, { status: 500 });
  }
}