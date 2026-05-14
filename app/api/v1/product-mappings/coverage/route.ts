import { NextResponse } from 'next/server';
import { getServerProductMappingCoverage, listServerProductMappings } from '@/lib/server/product-mapping-db';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let tenantId = '';
  try {
    tenantId = (await requireTenant(request)).tenantId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  return NextResponse.json({
    coverage: await getServerProductMappingCoverage([], tenantId),
    mappings: await listServerProductMappings(tenantId),
  });
}
