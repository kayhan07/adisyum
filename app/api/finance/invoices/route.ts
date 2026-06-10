import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireTenant(request);
    const payload = await posBackendJson('/finance/invoices', {}, 'Invoices could not be loaded.');
    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Invoices could not be loaded.',
    }, { status: 500 });
  }
}