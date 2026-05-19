import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { compileCanonicalPosCatalog, type CatalogChannel } from '@/lib/canonical-pos-catalog';
import { resolvePosFacingProductDomainType } from '@/lib/product-domain';
import { resolveProductIdentity } from '@/lib/product-identity';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUNTIME_CATALOG_KEY = 'runtime:pos-catalog';

function readChannel(value: string | null): CatalogChannel {
  if (value === 'qr' || value === 'kiosk' || value === 'delivery' || value === 'waiter_tablet' || value === 'mobile_pos') return value;
  return 'pos';
}

async function compileTenantCatalog(tenantId: string, branchId?: string, channel: CatalogChannel = 'pos') {
  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      posKey: true,
      externalId: true,
      legacyKey: true,
      revision: true,
      price: true,
      vatRate: true,
      unitType: true,
      productType: true,
      categoryId: true,
      imageUrl: true,
      thumbnailUrl: true,
      description: true,
    },
    take: 10000,
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { tenantId, id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const items = products.map((product) => {
    const category = categoryById.get(product.categoryId ?? '') ?? 'Mutfak';
    const identity = resolveProductIdentity({
      id: product.id,
      posKey: product.posKey,
      sku: product.sku,
      barcode: product.barcode,
      externalId: product.externalId,
      legacyKey: product.legacyKey,
      name: product.name,
    });
    const productType = resolvePosFacingProductDomainType({
      id: product.id,
      posKey: identity.posKey,
      name: product.name,
      category,
      productType: product.productType,
      price: product.price.toString(),
    });
    return {
      id: identity.posKey,
      productId: product.id,
      posKey: identity.posKey,
      sku: product.sku ?? undefined,
      barcode: product.barcode ?? undefined,
      externalId: product.externalId ?? undefined,
      legacyKey: product.legacyKey ?? product.name,
      revision: product.revision,
      name: product.name,
      category,
      productType,
      printCategory: category,
      salesUnit: product.unitType === 'kg' ? 'kg' as const : 'portion' as const,
      price: Number(product.price),
      vatRate: product.vatRate,
      allowComplimentary: true,
      allowDiscount: true,
      happyHourEligible: true,
      imageUrl: product.imageUrl ?? undefined,
      thumbnailUrl: product.thumbnailUrl ?? undefined,
      description: product.description ?? undefined,
    };
  });

  return compileCanonicalPosCatalog(items, {
    tenantId,
    branchId,
    channel,
    status: 'published',
  });
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId') ?? tenant.branchId ?? undefined;
    const channel = readChannel(url.searchParams.get('channel'));
    const deviceRevision = url.searchParams.get('catalogRevision');
    const catalog = await compileTenantCatalog(tenant.tenantId, branchId, channel);

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
    const body = (await request.json().catch(() => null)) as { branchId?: string; channel?: CatalogChannel } | null;
    const branchId = body?.branchId ?? tenant.branchId ?? undefined;
    const channel = body?.channel ?? 'pos';
    const catalog = await compileTenantCatalog(tenant.tenantId, branchId, channel);

    await prisma.runtimeState.upsert({
      where: runtimeStateTenantKey(tenant.tenantId, `${RUNTIME_CATALOG_KEY}:${branchId ?? 'global'}:${channel}`),
      update: { payload: JSON.parse(JSON.stringify(catalog)) as Prisma.InputJsonValue },
      create: {
        tenantId: tenant.tenantId,
        key: `${RUNTIME_CATALOG_KEY}:${branchId ?? 'global'}:${channel}`,
        payload: JSON.parse(JSON.stringify(catalog)) as Prisma.InputJsonValue,
      },
    });

    await publishTenantEvent(tenant.tenantId, 'products', {
      type: 'catalog.published',
      branchId,
      channel,
      catalogRevision: catalog.catalogRevision,
      itemCount: catalog.itemCount,
      checksum: catalog.checksum,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, catalog });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
