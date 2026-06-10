import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null, defaultValue: number, maxValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(Math.floor(parsed), maxValue);
}

export async function GET(request: Request) {
  try {
    await requireTenant(request);
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'), 200, 1000);
    const payload = await posBackendJson('/finance/payments', {}, 'Payments could not be loaded.');
    const result = Array.isArray(payload) ? payload.slice(0, limit) : payload;
    return NextResponse.json(result);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Payments could not be loaded.',
    }, { status: 500 });
  }
}