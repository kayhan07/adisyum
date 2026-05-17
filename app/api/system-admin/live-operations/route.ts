import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import { getLiveOperationsSnapshot } from '@/lib/operations/live-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    return NextResponse.json({ ok: true, ...(await getLiveOperationsSnapshot()), generatedAt: new Date().toISOString() });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    return NextResponse.json({ ok: false, error: 'Canli operasyon verisi alinamadi.' }, { status: 500 });
  }
}
