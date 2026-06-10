import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireTenant(request);
    const payload = await posBackendJson('/pos/devices', {}, 'POS device list could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS device list could not be loaded.',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTenant(request);
    const body = await request.json();
    const deviceId = typeof body?.id === 'string' ? body.id : null;
    const payload = await posBackendJson(deviceId ? `/pos/devices/${deviceId}` : '/pos/devices', {
      method: deviceId ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    }, 'POS device could not be saved.');

    return NextResponse.json(payload, { status: deviceId ? 200 : 201 });
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS device could not be saved.',
    }, { status: 500 });
  }
}