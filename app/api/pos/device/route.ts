import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await posBackendJson('/pos/devices', {}, 'POS device list could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS device list could not be loaded.',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = typeof body?.id === 'string' ? body.id : null;
    const payload = await posBackendJson(deviceId ? `/pos/devices/${deviceId}` : '/pos/devices', {
      method: deviceId ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    }, 'POS device could not be saved.');

    return NextResponse.json(payload, { status: deviceId ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS device could not be saved.',
    }, { status: 500 });
  }
}