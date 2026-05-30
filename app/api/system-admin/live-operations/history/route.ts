import { NextResponse } from 'next/server';
import { getHistoricalOperationalMetrics } from '@/lib/operations/telemetry-retention';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const url = new URL(request.url);
    const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days') ?? 7) || 7));
    return NextResponse.json({ ok: true, metrics: await getHistoricalOperationalMetrics(days), days });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    return NextResponse.json({ ok: false, error: 'Operasyon geçmişi alınamadı.' }, { status: 500 });
  }
}
