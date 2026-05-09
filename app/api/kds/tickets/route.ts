import { NextRequest, NextResponse } from 'next/server';
import { fetchKdsTickets } from '@/lib/server/kds-api';
import { getLocalKdsTickets } from '@/lib/server/kds-local';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel') ?? 'kitchen';
  const branchId = searchParams.get('branchId') ?? undefined;

  try {
    const payload = await fetchKdsTickets(channel, branchId);
    return NextResponse.json(payload);
  } catch (error) {
    const payload = getLocalKdsTickets(channel, branchId);
    return NextResponse.json(payload, {
      headers: {
        'X-KDS-Source': 'local-fallback',
        'X-KDS-Backend-Error': error instanceof Error ? error.message : 'KDS backend hatası',
      },
    });
  }
}
