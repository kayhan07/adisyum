import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSystemAdmin, isRouteResponse } from '@/lib/system-admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim();
    const tenantId = url.searchParams.get('tenantId')?.trim();
    const correlationId = url.searchParams.get('correlationId')?.trim();
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantId || undefined,
        correlationId: correlationId || undefined,
        OR: query ? [
          { action: { contains: query, mode: 'insensitive' } },
          { entity: { contains: query, mode: 'insensitive' } },
          { entityId: { contains: query, mode: 'insensitive' } },
          { userId: { contains: query, mode: 'insensitive' } },
          { deviceId: { contains: query, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
    });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/audit] failed', error);
    return NextResponse.json({ ok: false, error: 'Audit kayitlari alinamadi.' }, { status: 500 });
  }
}
