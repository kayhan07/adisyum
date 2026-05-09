import { NextResponse } from 'next/server';
import { getServerProductMappingCoverage, listServerProductMappings } from '@/lib/server/product-mapping-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    coverage: getServerProductMappingCoverage(),
    mappings: listServerProductMappings(),
  });
}
