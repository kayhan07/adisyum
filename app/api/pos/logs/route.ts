import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null, defaultValue: number, maxValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(Math.floor(parsed), maxValue);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'), 200, 1000);
    const payload = await posBackendJson<Array<Record<string, unknown>>>('/pos/logs', {}, 'POS logs could not be loaded.');
    return NextResponse.json(Array.isArray(payload) ? payload.slice(0, limit) : []);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'POS logs could not be loaded.',
    }, { status: 500 });
  }
}