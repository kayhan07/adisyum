import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import {
  cloneCatalogForRuntimeState,
  compileTenantPosCatalog,
  readRuntimeCatalogChannel,
  RUNTIME_POS_CATALOG_KEY,
} from '@/lib/server/runtime-pos-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId') ?? tenant.branchId ?? undefined;
    const channel = readRuntimeCatalogChannel(url.searchParams.get('channel'));
    const deviceRevision = url.searchParams.get('catalogRevision');
    const catalog = await compileTenantPosCatalog(tenant.tenantId, branchId, channel);

    return NextResponse.json({
      ok: true,
      catalog,
      safeMode: catalog.itemCount === 0,
      stale: deviceRevision ? deviceRevision !== catalog.catalogRevision : true,
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = (await request.json().catch(() => null)) as { branchId?: string; channel?: string } | null;
    const branchId = body?.branchId ?? tenant.branchId ?? undefined;
    const channel = readRuntimeCatalogChannel(body?.channel);
    const catalog = await compileTenantPosCatalog(tenant.tenantId, branchId, channel);

    await prisma.runtimeState.upsert({
      where: runtimeStateTenantKey(tenant.tenantId, `${RUNTIME_POS_CATALOG_KEY}:${branchId ?? 'global'}:${channel}`),
      update: { payload: cloneCatalogForRuntimeState(catalog) },
      create: {
        tenantId: tenant.tenantId,
        key: `${RUNTIME_POS_CATALOG_KEY}:${branchId ?? 'global'}:${channel}`,
        payload: cloneCatalogForRuntimeState(catalog),
      },
    });

    await publishTenantEvent(tenant.tenantId, 'products', {
      type: 'catalog.published',
      branchId,
      channel,
      catalogRevision: catalog.catalogRevision,
      itemCount: catalog.itemCount,
      checksum: catalog.checksum,
    }).catch((eventError) => {
      console.warn('[runtime-pos-catalog] tenant event publish failed', {
        timestamp: new Date().toISOString(),
        tenantId: tenant.tenantId,
        branchId,
        channel,
        catalogRevision: catalog.catalogRevision,
        error: eventError instanceof Error ? eventError.message : String(eventError),
      });
    });

    return NextResponse.json({ ok: true, catalog });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
