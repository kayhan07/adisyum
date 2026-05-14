import { NextResponse } from 'next/server';
import { buildWaiterUxScore } from '@/lib/ux/waiter-efficiency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    waiterUx: buildWaiterUxScore(),
    generatedAt: new Date().toISOString(),
  });
}
