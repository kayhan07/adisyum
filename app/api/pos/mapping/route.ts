import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import {
  bulkUpsertServerProductMappings,
  getServerProductMappingCoverage,
  listServerProductMappings,
  upsertServerProductMapping,
} from '@/lib/server/product-mapping-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [mappings, coverage] = await Promise.all([
      posBackendJson('/product-mappings', {}, 'POS mappings could not be loaded.'),
      posBackendJson('/product-mappings/coverage', {}, 'POS mapping coverage could not be loaded.'),
    ]);

    return NextResponse.json({ mappings, coverage });
  } catch (error) {
    return NextResponse.json({
      mappings: listServerProductMappings(),
      coverage: getServerProductMappingCoverage(),
      source: 'local',
      message: error instanceof Error ? error.message : 'POS mappings local kayıttan yüklendi.',
    });
  }
}

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const isBulk = Array.isArray(body?.mappings);

    const payload = await posBackendJson(isBulk ? '/product-mappings/bulk' : '/product-mappings', {
      method: 'POST',
      body: JSON.stringify(body),
    }, 'POS mapping could not be saved.');

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    try {
      const mappings = Array.isArray(body?.mappings)
        ? bulkUpsertServerProductMappings(body.mappings)
        : [upsertServerProductMapping(body)];

      return NextResponse.json({
        success: true,
        source: 'local',
        mappings,
        coverage: getServerProductMappingCoverage(),
        message: 'POS mapping yerel kayda işlendi.',
      }, { status: 201 });
    } catch {
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : 'POS mapping kaydedilemedi.',
      }, { status: 500 });
    }
  }
}
