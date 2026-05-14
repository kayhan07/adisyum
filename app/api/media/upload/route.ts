import { type NextRequest, NextResponse } from 'next/server';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { optimizeAndSave, type MediaEntityType } from '@/lib/media-optimizer';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let tenant;
  try {
    tenant = await requireTenant(req);
  } catch (err) {
    return tenantAuthErrorResponse(err);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Form verisi okunamadı' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
  }

  const entityType = (formData.get('entityType') as MediaEntityType | null) ?? 'product';
  const entityId = (formData.get('entityId') as string | null) ?? '';

  if (!['product', 'category'].includes(entityType)) {
    return NextResponse.json({ error: 'Geçersiz entityType' }, { status: 400 });
  }

  const bytes = await (file as File).arrayBuffer();
  const buffer = Buffer.from(bytes);

  let result;
  try {
    result = await optimizeAndSave(buffer, (file as File).name, (file as File).type, tenant.tenantId, entityType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        tenantId: tenant.tenantId,
        entityType,
        entityId,
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        webpUrl: result.webpUrl,
        mimeType: result.mimeType,
        originalName: result.originalName,
        sizeBytes: result.sizeBytes,
        width: result.width,
        height: result.height,
        thumbWidth: result.thumbWidth,
        thumbHeight: result.thumbHeight,
        optimizedSizeBytes: result.optimizedSizeBytes,
      },
    });

    if (entityId) {
      if (entityType === 'product') {
        await prisma.product.updateMany({
          where: { id: entityId, tenantId: tenant.tenantId },
          data: { imageUrl: result.url, thumbnailUrl: result.thumbnailUrl },
        });
      } else {
        await prisma.productCategory.updateMany({
          where: { id: entityId, tenantId: tenant.tenantId },
          data: { imageUrl: result.url, thumbnailUrl: result.thumbnailUrl },
        });
      }
    }

    return NextResponse.json({ ok: true, asset, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...result });
  }
}

