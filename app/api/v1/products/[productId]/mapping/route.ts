import { NextResponse } from 'next/server';
import { getServerProductMapping } from '@/lib/server/product-mapping-db';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let tenantId = '';
  try {
    tenantId = (await requireTenant(request)).tenantId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  const { productId } = await params;
  const mapping = await getServerProductMapping(decodeURIComponent(productId), tenantId);
  const errors: string[] = [];

  if (!mapping) errors.push('POS PLU eşleştirmesi yok.');
  if (mapping && mapping.status !== 'valid') errors.push('POS eşleştirme geçersiz.');

  return NextResponse.json({
    is_mapped: Boolean(mapping),
    is_valid: Boolean(mapping && mapping.status === 'valid'),
    is_verified: Boolean(mapping?.verified),
    mapping,
    errors,
  });
}
