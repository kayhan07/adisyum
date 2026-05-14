import { type NextRequest, NextResponse } from 'next/server';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let tenant;
  try {
    tenant = await requireTenant(req);
  } catch (err) {
    return tenantAuthErrorResponse(err);
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType') ?? undefined;
  const entityId = url.searchParams.get('entityId') ?? undefined;

  try {
    const assets = await prisma.mediaAsset.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ assets: [] });
  }
}
