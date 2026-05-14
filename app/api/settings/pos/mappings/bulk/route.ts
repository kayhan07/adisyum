import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { bulkUpsertServerProductMappings, getServerProductMappingCoverage } from '@/lib/server/product-mapping-db';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let tenantId = '';
  let body: any = null;

  try {
    tenantId = (await requireTenant(request)).tenantId;
    body = await request.json();
    const payload = await posBackendJson('/product-mappings/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }, 'Toplu POS eslestirme kaydedilemedi.');

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if (!tenantId) return tenantAuthErrorResponse(error);
    const mappings = await bulkUpsertServerProductMappings(Array.isArray(body?.mappings) ? body.mappings : [], tenantId);

    return NextResponse.json({
      success: true,
      source: 'db',
      mappings,
      coverage: await getServerProductMappingCoverage([], tenantId),
      message: error instanceof Error ? error.message : 'Toplu POS eslestirme DB kaydina islendi.',
    }, { status: 201 });
  }
}
