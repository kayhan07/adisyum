import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const payload = await posBackendJson('/pos/retry-failed', {
      method: 'POST',
    }, 'Başarısız POS işlemleri yeniden denenemedi.');

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Başarısız POS işlemleri yeniden denenemedi.',
    }, { status: 500 });
  }
}
