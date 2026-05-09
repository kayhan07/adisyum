import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { bulkUpsertServerProductMappings, getServerProductMappingCoverage } from '@/lib/server/product-mapping-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: any = null;

  try {
    body = await request.json();
    const payload = await posBackendJson('/product-mappings/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }, 'Toplu POS eşleştirme kaydedilemedi.');

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const mappings = bulkUpsertServerProductMappings(Array.isArray(body?.mappings) ? body.mappings : []);

    return NextResponse.json({
      success: true,
      source: 'local',
      mappings,
      coverage: getServerProductMappingCoverage(),
      message: error instanceof Error ? error.message : 'Toplu POS eşleştirme yerel kayda işlendi.',
    }, { status: 201 });
  }
}
