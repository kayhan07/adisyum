import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = await posBackendJson('/pos/devices', {
      method: 'POST',
      body: JSON.stringify(body),
    }, 'POS cihazı kaydedilemedi.');

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS cihazı kaydedilemedi.',
    }, { status: 500 });
  }
}
