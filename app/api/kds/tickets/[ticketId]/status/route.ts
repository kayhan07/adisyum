import { NextRequest, NextResponse } from 'next/server';
import type { KdsStatus } from '@/lib/kds-types';
import { updateKdsTicketStatus } from '@/lib/server/kds-api';
import { updateLocalKdsTicketStatus } from '@/lib/server/kds-local';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { status?: KdsStatus; branchId?: string } | null;

  if (!payload?.status) {
    return NextResponse.json({ message: 'Yeni durum zorunludur.' }, { status: 422 });
  }

  try {
    const ticket = await updateKdsTicketStatus(ticketId, payload.status, payload.branchId);
    return NextResponse.json(ticket);
  } catch (error) {
    try {
      const ticket = updateLocalKdsTicketStatus(ticketId, payload.status, payload.branchId);
      return NextResponse.json(ticket, {
        headers: {
          'X-KDS-Source': 'local-fallback',
          'X-KDS-Backend-Error': error instanceof Error ? error.message : 'KDS backend hatası',
        },
      });
    } catch (localError) {
      const message = localError instanceof Error ? localError.message : 'KDS durumu güncellenemedi.';
      return NextResponse.json({ message }, { status: 500 });
    }
  }
}
