import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ invoiceId: string }> };

export async function POST(_request: Request, context: Context) {
  const { invoiceId } = await context.params;

  try {
    await requireTenant(_request);
    const payload = await posBackendJson(`/finance/invoices/${invoiceId}/retry`, { method: 'POST' }, 'Invoice retry failed.');
    return NextResponse.json(payload);
  } catch (error) {
    const authResponse = tenantAuthErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    return NextResponse.json({
      message: error instanceof Error ? error.message : 'Invoice retry failed.',
    }, { status: 500 });
  }
}