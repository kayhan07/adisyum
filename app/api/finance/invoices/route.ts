import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await posBackendJson('/finance/invoices', {}, 'Invoices could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Invoices could not be loaded.',
    }, { status: 500 });
  }
}