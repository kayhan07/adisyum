import { type NextRequest, NextResponse } from 'next/server';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { prisma } from '@/lib/db/prisma';
import { deleteMediaFiles } from '@/lib/media-optimizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  let tenant;
  try {
    tenant = await requireTenant(req);
  } catch (err) {
    return tenantAuthErrorResponse(err);
  }

  const { assetId } = (await req.json()) as { assetId?: string };
  if (!assetId) return NextResponse.json({ error: 'assetId gerekli' }, { status: 400 });

  try {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, tenantId: tenant.tenantId },
    });
    if (!asset) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });

    // Delete physical files
    deleteMediaFiles([asset.url, asset.thumbnailUrl ?? '', asset.webpUrl ?? ''].filter(Boolean));

    await prisma.mediaAsset.delete({ where: { id: assetId } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Silme başarısız' }, { status: 500 });
  }
}
