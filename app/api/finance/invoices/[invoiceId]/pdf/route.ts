import { NextResponse } from 'next/server';
import { posBackendResponse } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: Request, context: Context) {
  const { invoiceId } = await context.params;

  try {
    const response = await posBackendResponse(`/finance/invoices/${invoiceId}/pdf`, { method: 'GET' });
    const buffer = await response.arrayBuffer();

    if (!response.ok) {
      return NextResponse.json({ message: 'Invoice PDF could not be loaded.' }, { status: response.status });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ message: 'Invoice PDF could not be loaded.' }, { status: 500 });
  }
}