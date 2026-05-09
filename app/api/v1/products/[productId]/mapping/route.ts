import { NextResponse } from 'next/server';
import { getServerProductMapping } from '@/lib/server/product-mapping-db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const mapping = getServerProductMapping(decodeURIComponent(productId));
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
