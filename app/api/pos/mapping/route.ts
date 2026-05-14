import { NextRequest, NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import {
  bulkUpsertServerProductMappings,
  getServerProductMappingCoverage,
  listServerProductMappings,
  upsertServerProductMapping,
} from '@/lib/server/product-mapping-db';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let tenantId = '';
  try {
    tenantId = (await requireTenant(request)).tenantId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  try {
    const [mappings, coverage] = await Promise.all([
      posBackendJson('/product-mappings', {}, 'POS mappings could not be loaded.'),
      posBackendJson('/product-mappings/coverage', {}, 'POS mapping coverage could not be loaded.'),
    ]);

    return NextResponse.json({ mappings, coverage });
  } catch (error) {
    return NextResponse.json({
      mappings: await listServerProductMappings(tenantId),
      coverage: await getServerProductMappingCoverage([], tenantId),
      source: 'db',
      message: error instanceof Error ? error.message : 'POS mappings DB kaydindan yuklendi.',
    });
  }
}

export async function POST(request: NextRequest) {
  let tenantId = '';
  let body: any = null;
  try {
    tenantId = (await requireTenant(request)).tenantId;
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
        ? await bulkUpsertServerProductMappings(body.mappings, tenantId)
        : [await upsertServerProductMapping(body, tenantId)];

      return NextResponse.json({
        success: true,
        source: 'db',
        mappings,
        coverage: await getServerProductMappingCoverage([], tenantId),
        message: 'POS mapping DB kaydina islendi.',
      }, { status: 201 });
    } catch {
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : 'POS mapping kaydedilemedi.',
      }, { status: 500 });
    }
  }
}
