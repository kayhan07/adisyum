import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireTenant(request);
    const days = request.nextUrl.searchParams.get('days') || '30';
    const payload = await posBackendJson(`/finance/daily-reports?days=${encodeURIComponent(days)}`, {}, 'Daily reports could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Daily reports could not be loaded.',
    }, { status: 500 });
  }
}