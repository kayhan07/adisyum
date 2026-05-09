import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const days = request.nextUrl.searchParams.get('days') || '30';
    const payload = await posBackendJson(`/finance/daily-reports?days=${encodeURIComponent(days)}`, {}, 'Daily reports could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Daily reports could not be loaded.',
    }, { status: 500 });
  }
}