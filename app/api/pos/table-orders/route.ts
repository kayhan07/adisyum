import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { recordOperationalEvent } from '@/lib/operations/live-ops';
import { inferProductDomainType, isSellableProductType, resolvePosFacingProductDomainType } from '@/lib/product-domain';
import { isUuidIdentity, resolveProductIdentity } from '@/lib/product-identity';
import { isRuntimeVisibleProduct } from '@/lib/product-lifecycle-governance';
import { compileTenantPosCatalog } from '@/lib/server/runtime-pos-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAT_RATE = 0.1;

type OrderLinePayload = {
  id: string;
  productId?: string;
  posKey?: string;
  catalogRevision?: string;
  productRevision?: number;
  productSnapshot?: Record<string, unknown>;
  name: string;
  qty: number;
  note: string;
  price: number;
  category: string;
  printCategory?: string;
  sentQty: number;
  guestName?: string;
  spicePreference?: 'acili' | 'acisiz' | 'standart';
  cookingPreference?: 'standart' | 'az' | 'orta' | 'iyi';
  extrasNote?: string;
  removalNote?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  isReturn?: boolean;
  allowDiscount?: boolean;
  allowComplimentary?: boolean;
  happyHourEligible?: boolean;
};

function tableOrderNo(tableId: string) {
  return `TABLE-${tableId}`;
}

function mutationTraceId(mutationId?: string) {
  return mutationId || `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isUuid(value: string | undefined) {
  return isUuidIdentity(value);
}

function logTableOrderEvent(event: string, payload: Record<string, unknown>) {
  if (process.env.POS_DIAGNOSTICS !== '1') return;
  console.info(`[pos-table-orders] ${event}`, {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function runtimeInsertionErrorResponse(input: {
  status: number;
  reason: string;
  traceId: string;
  tenantId: string;
  branchId?: string;
  tableId?: string;
  product?: Record<string, unknown> | null;
  catalogRevision?: string;
  serverCatalogRevision?: string;
  details?: Record<string, unknown>;
}) {
  const payload = {
    ok: false,
    error: 'POS runtime insertion rejected.',
    code: input.reason,
    reason: input.reason,
    traceId: input.traceId,
    tenantId: input.tenantId,
    branchId: input.branchId,
    tableId: input.tableId,
    catalogRevision: input.catalogRevision,
    serverCatalogRevision: input.serverCatalogRevision,
    productIdentity: input.product,
    details: input.details,
  };
  console.error('[pos-table-orders] runtime insertion rejected', {
    timestamp: new Date().toISOString(),
    ...payload,
  });
  return NextResponse.json(payload, { status: input.status });
}

function mutationErrorResponse(error: unknown, traceId: string, tenantId: string, tableId?: string) {
  if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);

  const message = error instanceof Error ? error.message : String(error);
  console.error('[pos-table-orders] mutation failed', {
    timestamp: new Date().toISOString(),
    traceId,
    tenantId,
    tableId,
    error,
  });
  return NextResponse.json(
    {
      ok: false,
      error: 'POS order mutation failed.',
      message,
      traceId,
    },
    { status: 500 },
  );
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

function getLineSubtotal(line: Pick<OrderLinePayload, 'qty' | 'price' | 'complimentary' | 'isReturn'>) {
  if (line.complimentary) return 0;
  const value = line.qty * line.price;
  return line.isReturn ? -value : value;
}

function normalizeMetadata(input: Prisma.JsonValue | null | undefined) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function compactJsonObject(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}

function itemToLine(item: {
  id: string;
  productId: string | null;
  name: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  notes: string | null;
  metadata: Prisma.JsonValue;
}): OrderLinePayload {
  const metadata = normalizeMetadata(item.metadata);
  return {
    id: item.id,
    productId: item.productId ?? (typeof metadata.productKey === 'string' ? metadata.productKey : undefined),
    posKey: typeof metadata.posKey === 'string'
      ? metadata.posKey
      : typeof metadata.productKey === 'string'
        ? metadata.productKey
        : undefined,
    catalogRevision: typeof metadata.catalogRevision === 'string' ? metadata.catalogRevision : undefined,
    productRevision: typeof metadata.productRevision === 'number' ? metadata.productRevision : undefined,
    productSnapshot: normalizeMetadata(metadata.productSnapshot as Prisma.JsonValue),
    name: item.name,
    qty: decimalToNumber(item.quantity),
    note: item.notes ?? '',
    price: decimalToNumber(item.unitPrice),
    category: typeof metadata.category === 'string' ? metadata.category : 'mutfak',
    printCategory: typeof metadata.printCategory === 'string' ? metadata.printCategory : undefined,
    sentQty: typeof metadata.sentQty === 'number' ? metadata.sentQty : 0,
    guestName: typeof metadata.guestName === 'string' ? metadata.guestName : undefined,
    spicePreference: (metadata.spicePreference as OrderLinePayload['spicePreference']) ?? 'standart',
    cookingPreference: (metadata.cookingPreference as OrderLinePayload['cookingPreference']) ?? 'standart',
    extrasNote: typeof metadata.extrasNote === 'string' ? metadata.extrasNote : undefined,
    removalNote: typeof metadata.removalNote === 'string' ? metadata.removalNote : undefined,
    complimentary: Boolean(metadata.complimentary),
    complimentaryReason: typeof metadata.complimentaryReason === 'string' ? metadata.complimentaryReason : undefined,
    isReturn: Boolean(metadata.isReturn),
    allowDiscount: typeof metadata.allowDiscount === 'boolean' ? metadata.allowDiscount : true,
    allowComplimentary: typeof metadata.allowComplimentary === 'boolean' ? metadata.allowComplimentary : true,
    happyHourEligible: Boolean(metadata.happyHourEligible),
  };
}

async function loadAuthoritativeOrdersByTable(tenantId: string) {
  const orders = await prisma.order.findMany({
    where: { tenantId, status: 'open', orderNo: { startsWith: 'TABLE-' } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      tableId: true,
      orderNo: true,
      metadata: true,
    },
    take: 500,
  });

  const orderIds = orders.map((order) => order.id);
  const items = orderIds.length > 0
    ? await prisma.orderItem.findMany({
        where: { tenantId, orderId: { in: orderIds } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          orderId: true,
          productId: true,
          name: true,
          quantity: true,
          unitPrice: true,
          notes: true,
          metadata: true,
        },
      })
    : [];

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push(item);
    itemsByOrder.set(item.orderId, current);
  }

  return Object.fromEntries(
    orders.map((order) => {
      const metadata = normalizeMetadata(order.metadata);
      const tableId = typeof metadata.tableKey === 'string'
        ? metadata.tableKey
        : order.orderNo.startsWith('TABLE-')
          ? order.orderNo.slice('TABLE-'.length)
          : String(order.tableId ?? '');
      return [tableId, (itemsByOrder.get(order.id) ?? []).map(itemToLine)];
    }),
  ) as Record<string, OrderLinePayload[]>;
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const ordersByTable = await loadAuthoritativeOrdersByTable(tenant.tenantId);
    return NextResponse.json({ ok: true, ordersByTable, source: 'db' });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let tenantId = '';
  let tableId = '';
  let traceId = mutationTraceId();
  let updatedOrderId = '';
  let updatedLineCount = 0;
  try {
    logTableOrderEvent('request-entry', { traceId, method: 'POST' });
    const tenant = await requireTenant(request);
    tenantId = tenant.tenantId;
    logTableOrderEvent('tenant-validated', {
      traceId,
      tenantId,
      branchId: tenant.branchId,
      userId: tenant.userId,
    });
    const body = (await request.json().catch(() => null)) as {
      tableId?: string;
      mutationId?: string;
      product?: {
        id?: string;
        productId?: string;
        posKey?: string;
        catalogRevision?: string;
        sku?: string;
        barcode?: string;
        externalId?: string;
        legacyKey?: string;
        revision?: number;
        name?: string;
        productType?: string;
        price?: number;
        category?: string;
        printCategory?: string;
        quantity?: number;
        note?: string;
        guestName?: string;
        spicePreference?: OrderLinePayload['spicePreference'];
        cookingPreference?: OrderLinePayload['cookingPreference'];
        extrasNote?: string;
        removalNote?: string;
        complimentary?: boolean;
        complimentaryReason?: string;
        isReturn?: boolean;
        allowDiscount?: boolean;
        allowComplimentary?: boolean;
        happyHourEligible?: boolean;
        productSnapshot?: Record<string, unknown>;
      };
    } | null;

    traceId = mutationTraceId(body?.mutationId?.trim());
    tableId = body?.tableId?.trim() ?? '';
    const product = body?.product;
    const productSnapshot = product?.productSnapshot && typeof product.productSnapshot === 'object'
      ? product.productSnapshot
      : null;
    const productName = product?.name?.trim() || (typeof productSnapshot?.name === 'string' ? productSnapshot.name.trim() : '');
    const identity = resolveProductIdentity({
      id: product?.productId || product?.id,
      posKey: product?.posKey,
      sku: product?.sku,
      barcode: product?.barcode,
      externalId: product?.externalId,
      legacyKey: product?.legacyKey,
      name: productName,
    });
    const price = Number(product?.price ?? 0);
    const quantityToAdd = Math.max(1, Number(product?.quantity ?? 1) || 1);

    logTableOrderEvent('payload-received', {
      traceId,
      tenantId,
      branchId: tenant.branchId,
      tableId,
      productId: product?.id,
      productUuid: product?.productId,
      posKey: identity.posKey,
      requestedPosKey: product?.posKey,
      catalogRevision: product?.catalogRevision,
      legacyKey: identity.legacyKey,
      snapshotPosKey: productSnapshot?.posKey,
      snapshotRevision: productSnapshot?.revision,
      snapshotProductType: productSnapshot?.productType,
      productName,
      price,
      quantityToAdd,
    });

    if (!tableId || !product || !Number.isFinite(quantityToAdd)) {
      return runtimeInsertionErrorResponse({
        status: 400,
        reason: 'malformed_order_item',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: product?.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: product?.posKey,
          legacyKey: product?.legacyKey,
          name: productName,
        },
        details: { productName, price, quantityToAdd },
      });
    }

    const requestedProductType = inferProductDomainType({
      name: productName || String(productSnapshot?.name ?? ''),
      category: product?.category,
      explicitType: product?.productType,
    });
    if (!isSellableProductType(requestedProductType)) {
      return runtimeInsertionErrorResponse({
        status: 400,
        reason: requestedProductType === 'stock_item' ? 'stock_item_rejection' : 'invalid_productType',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: product?.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
          productType: requestedProductType,
        },
      });
    }

    const clientCatalogRevision = product?.catalogRevision?.trim();
    const runtimeCatalog = await compileTenantPosCatalog(tenantId, tenant.branchId ?? undefined, 'pos');
    const catalogItem = runtimeCatalog.items.find((item) => item.posKey === identity.posKey);
    logTableOrderEvent('runtime-catalog-resolved', {
      traceId,
      tenantId,
      branchId: tenant.branchId,
      tableId,
      posKey: identity.posKey,
      clientCatalogRevision,
      serverCatalogRevision: runtimeCatalog.catalogRevision,
      catalogItemCount: runtimeCatalog.itemCount,
      catalogChecksum: runtimeCatalog.checksum,
      cacheMiss: !catalogItem,
      hasRuntimeSnapshot: Boolean(productSnapshot),
    });

    if (!product?.posKey) {
      return runtimeInsertionErrorResponse({
        status: 400,
        reason: 'unknown_posKey',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: product?.posKey,
          resolvedPosKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
        },
        details: { identityHealth: identity.identityHealth },
      });
    }

    if (!productSnapshot) {
      return runtimeInsertionErrorResponse({
        status: 400,
        reason: 'missing_runtime_snapshot',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
        },
      });
    }

    if (!catalogItem) {
      return runtimeInsertionErrorResponse({
        status: 404,
        reason: 'runtime_catalog_cache_miss',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
        },
      });
    }

    if (clientCatalogRevision !== runtimeCatalog.catalogRevision || clientCatalogRevision !== catalogItem.catalogRevision) {
      return runtimeInsertionErrorResponse({
        status: 409,
        reason: 'stale_revision',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
        },
        details: {
          itemCatalogRevision: catalogItem.catalogRevision,
          catalogChecksum: runtimeCatalog.checksum,
        },
      });
    }

    if (
      productSnapshot.posKey !== catalogItem.productSnapshot.posKey
      || Number(productSnapshot.revision) !== catalogItem.productSnapshot.revision
      || productSnapshot.productType !== catalogItem.productSnapshot.productType
    ) {
      return runtimeInsertionErrorResponse({
        status: 409,
        reason: 'resolver_mismatch',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product?.productId || product?.id,
          posKey: identity.posKey,
          legacyKey: identity.legacyKey,
          name: productName,
        },
        details: {
          clientSnapshot: productSnapshot,
          serverSnapshot: catalogItem.productSnapshot,
        },
      });
    }

    if (!isSellableProductType(catalogItem.productSnapshot.productType)) {
      return runtimeInsertionErrorResponse({
        status: 400,
        reason: catalogItem.productSnapshot.productType === 'stock_item' ? 'stock_item_rejection' : 'invalid_productType',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision: clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: catalogItem.productSnapshot.productId,
          posKey: catalogItem.productSnapshot.posKey,
          name: catalogItem.productSnapshot.name,
          productType: catalogItem.productSnapshot.productType,
        },
      });
    }

    const catalogRevision = catalogItem.catalogRevision;
    if (product.productId && catalogItem.productSnapshot.productId && product.productId !== catalogItem.productSnapshot.productId) {
      return runtimeInsertionErrorResponse({
        status: 409,
        reason: 'UUID_mismatch',
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        catalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
        product: {
          productId: product.productId,
          catalogProductId: catalogItem.productSnapshot.productId,
          posKey: identity.posKey,
          name: productName,
        },
      });
    }
    let dbProductId = product.productId || (isUuid(product.id) ? product.id : undefined) || catalogItem.productSnapshot.productId;
    const persistedProduct = await prisma.product.findFirst({
      where: dbProductId
        ? { tenantId, id: dbProductId }
        : { tenantId, posKey: identity.posKey },
      select: {
        id: true,
        posKey: true,
        productType: true,
        active: true,
        lifecycleStatus: true,
        publishStatus: true,
        deletedAt: true,
        revision: true,
        name: true,
        categoryId: true,
        price: true,
      },
    });
    if (persistedProduct) {
      dbProductId = persistedProduct.id;
      const category = persistedProduct?.categoryId
        ? await prisma.productCategory.findFirst({ where: { tenantId, id: persistedProduct.categoryId }, select: { name: true } })
        : null;
      const persistedProductType = persistedProduct
        ? resolvePosFacingProductDomainType({
            id: persistedProduct.id,
            name: persistedProduct.name,
            category: category?.name ?? product?.category ?? null,
            productType: persistedProduct.productType,
            price: persistedProduct.price.toString(),
          })
        : null;
      if (persistedProduct && (!isRuntimeVisibleProduct(persistedProduct) || !isSellableProductType(persistedProductType))) {
        return runtimeInsertionErrorResponse({
          status: 400,
          reason: 'missing_catalog_entry',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
          catalogRevision,
          serverCatalogRevision: runtimeCatalog.catalogRevision,
          product: {
            productId: persistedProduct.id,
            posKey: identity.posKey,
            name: persistedProduct.name,
            productType: persistedProduct.productType,
          },
          details: {
            lifecycleStatus: persistedProduct.lifecycleStatus,
            publishStatus: persistedProduct.publishStatus,
            resolvedProductType: persistedProductType,
          },
        });
      }
      if (clientCatalogRevision && Number.isFinite(Number(product?.revision)) && Number(product?.revision) !== persistedProduct.revision) {
        logTableOrderEvent('product-revision-mismatch', {
          traceId,
          tenantId,
          tableId,
          posKey: identity.posKey,
          clientRevision: product?.revision,
          serverRevision: persistedProduct.revision,
        });
        return runtimeInsertionErrorResponse({
          status: 409,
          reason: 'product_revision_mismatch',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
          catalogRevision,
          serverCatalogRevision: runtimeCatalog.catalogRevision,
          product: {
            productId: persistedProduct.id,
            posKey: identity.posKey,
            name: persistedProduct.name,
          },
          details: { clientRevision: product?.revision, serverRevision: persistedProduct.revision },
        });
      }
    } else if (product?.id) {
      logTableOrderEvent('product-db-lookup-skipped', {
        traceId,
        tenantId,
        tableId,
        productId: product.id,
        reason: 'runtime-pos-key-or-legacy-key',
      });
    }

    const productInput = {
      id: dbProductId,
      posKey: catalogItem.productSnapshot.posKey,
      catalogRevision,
      legacyKey: catalogItem.productSnapshot.legacyKey ?? identity.legacyKey,
      sku: catalogItem.productSnapshot.sku ?? identity.sku,
      barcode: catalogItem.productSnapshot.barcode ?? identity.barcode,
      externalId: catalogItem.productSnapshot.externalId ?? identity.externalId,
      revision: catalogItem.productSnapshot.revision,
      runtimeIdentityMode: 'catalog',
      productType: catalogItem.productSnapshot.productType,
      name: catalogItem.productSnapshot.name,
      price: catalogItem.productSnapshot.price,
      category: catalogItem.productSnapshot.category,
      printCategory: product?.printCategory ?? catalogItem.printCategory ?? catalogItem.productSnapshot.category,
      note: product?.note ?? '',
      guestName: product?.guestName ?? '',
      spicePreference: product?.spicePreference ?? 'standart',
      cookingPreference: product?.cookingPreference ?? 'standart',
      extrasNote: product?.extrasNote ?? '',
      removalNote: product?.removalNote ?? '',
      complimentary: product?.complimentary ?? false,
      complimentaryReason: product?.complimentaryReason ?? '',
      isReturn: product?.isReturn ?? false,
      allowDiscount: product?.allowDiscount ?? true,
      allowComplimentary: product?.allowComplimentary ?? true,
      happyHourEligible: product?.happyHourEligible ?? false,
    };
    const mutationId = body?.mutationId?.trim() || `${tableId}-${Date.now()}`;
    const orderNo = tableOrderNo(tableId);

    logTableOrderEvent('transaction-start', {
      traceId,
      tenantId,
      tableId,
      orderNo,
      mutationId,
    });

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.upsert({
        where: { tenantId_orderNo: { tenantId, orderNo } },
        update: {
          status: 'open',
          metadata: {
            tableKey: tableId,
            source: 'pos-table-orders',
            lastMutationId: mutationId,
            updatedAtMs: Date.now(),
          },
        },
        create: {
          tenantId,
          orderNo,
          status: 'open',
          subtotal: 0,
          discount: 0,
          taxTotal: 0,
          total: 0,
          metadata: {
            tableKey: tableId,
            source: 'pos-table-orders',
            lastMutationId: mutationId,
            updatedAtMs: Date.now(),
          },
        },
      });
      logTableOrderEvent('order-upserted', {
        traceId,
        tenantId,
        tableId,
        orderId: order.id,
        orderNo,
      });

      const existingItems = await tx.orderItem.findMany({
          where: { tenantId, orderId: order.id },
          select: { id: true, name: true, unitPrice: true, notes: true, quantity: true, metadata: true },
      });

      const matching = existingItems.find((item) => {
        const metadata = normalizeMetadata(item.metadata);
        return item.name === productInput.name &&
          decimalToNumber(item.unitPrice) === price &&
          (item.notes ?? '') === productInput.note &&
          (metadata.category ?? productInput.category) === productInput.category &&
          (metadata.guestName ?? '') === productInput.guestName &&
          (metadata.spicePreference ?? 'standart') === productInput.spicePreference &&
          (metadata.cookingPreference ?? 'standart') === productInput.cookingPreference &&
          (metadata.extrasNote ?? '') === productInput.extrasNote &&
          (metadata.removalNote ?? '') === productInput.removalNote &&
          Boolean(metadata.complimentary) === productInput.complimentary &&
          (metadata.complimentaryReason ?? '') === productInput.complimentaryReason &&
          Boolean(metadata.isReturn) === productInput.isReturn;
      });

      if (matching) {
        const nextQty = decimalToNumber(matching.quantity) + quantityToAdd;
        await tx.orderItem.update({
          where: { id: matching.id, tenantId },
          data: {
            quantity: nextQty,
            total: getLineSubtotal({
              qty: nextQty,
              price,
              complimentary: productInput.complimentary,
              isReturn: productInput.isReturn,
            }),
            metadata: compactJsonObject({
              ...normalizeMetadata(matching.metadata),
              productId: productInput.id || undefined,
              productKey: productInput.posKey,
              posKey: productInput.posKey,
              catalogRevision: productInput.catalogRevision,
              legacyKey: productInput.legacyKey,
              sku: productInput.sku,
              barcode: productInput.barcode,
              externalId: productInput.externalId,
              productRevision: productInput.revision,
              runtimeIdentityMode: productInput.runtimeIdentityMode,
              productSnapshot: {
                productId: productInput.id || undefined,
                posKey: productInput.posKey,
                name: productInput.name,
                category: productInput.category,
                printCategory: productInput.printCategory,
                price: productInput.price,
                productType: productInput.productType,
                revision: productInput.revision,
                catalogRevision: productInput.catalogRevision,
                sku: productInput.sku,
                barcode: productInput.barcode,
                externalId: productInput.externalId,
                legacyKey: productInput.legacyKey,
                runtimeIdentityMode: productInput.runtimeIdentityMode,
              },
              category: productInput.category,
              printCategory: productInput.printCategory,
              guestName: productInput.guestName || undefined,
              spicePreference: productInput.spicePreference,
              cookingPreference: productInput.cookingPreference,
              extrasNote: productInput.extrasNote || undefined,
              removalNote: productInput.removalNote || undefined,
              complimentary: productInput.complimentary,
              complimentaryReason: productInput.complimentaryReason || undefined,
              isReturn: productInput.isReturn,
              mutationId,
              updatedAtMs: Date.now(),
            }),
          },
        });
        logTableOrderEvent('order-item-updated', {
          traceId,
          tenantId,
          tableId,
          orderId: order.id,
          orderItemId: matching.id,
          nextQty,
        });
      } else {
        const createdItem = await tx.orderItem.create({
          data: {
            tenantId,
            orderId: order.id,
            productId: productInput.id && isUuid(productInput.id) ? productInput.id : null,
            name: productInput.name,
            quantity: quantityToAdd,
            unitPrice: price,
            total: getLineSubtotal({
              qty: quantityToAdd,
              price,
              complimentary: productInput.complimentary,
              isReturn: productInput.isReturn,
            }),
            notes: productInput.note || null,
            metadata: compactJsonObject({
              productId: productInput.id || undefined,
              productKey: productInput.posKey,
              posKey: productInput.posKey,
              catalogRevision: productInput.catalogRevision,
              legacyKey: productInput.legacyKey,
              sku: productInput.sku,
              barcode: productInput.barcode,
              externalId: productInput.externalId,
              productRevision: productInput.revision,
              runtimeIdentityMode: productInput.runtimeIdentityMode,
              productSnapshot: {
                productId: productInput.id || undefined,
                posKey: productInput.posKey,
                name: productInput.name,
                category: productInput.category,
                printCategory: productInput.printCategory,
                price: productInput.price,
                productType: productInput.productType,
                revision: productInput.revision,
                catalogRevision: productInput.catalogRevision,
                sku: productInput.sku,
                barcode: productInput.barcode,
                externalId: productInput.externalId,
                legacyKey: productInput.legacyKey,
                runtimeIdentityMode: productInput.runtimeIdentityMode,
              },
              category: productInput.category,
              printCategory: productInput.printCategory,
              sentQty: 0,
              guestName: productInput.guestName || undefined,
              spicePreference: productInput.spicePreference,
              cookingPreference: productInput.cookingPreference,
              extrasNote: productInput.extrasNote || undefined,
              removalNote: productInput.removalNote || undefined,
              complimentary: productInput.complimentary,
              complimentaryReason: productInput.complimentaryReason || undefined,
              isReturn: productInput.isReturn,
              allowDiscount: productInput.allowDiscount,
              allowComplimentary: productInput.allowComplimentary,
              happyHourEligible: productInput.happyHourEligible,
              mutationId,
              updatedAtMs: Date.now(),
            }),
          },
        });
        logTableOrderEvent('order-item-created', {
          traceId,
          tenantId,
          tableId,
          orderId: order.id,
          orderItemId: createdItem.id,
          quantity: quantityToAdd,
        });
      }

      const nextItems = await tx.orderItem.findMany({
        where: { tenantId, orderId: order.id },
        select: { quantity: true, unitPrice: true, metadata: true },
      });
      const subtotal = nextItems.reduce((sum, item) => {
        const metadata = normalizeMetadata(item.metadata);
        return sum + getLineSubtotal({
          qty: decimalToNumber(item.quantity),
          price: decimalToNumber(item.unitPrice),
          complimentary: Boolean(metadata.complimentary),
          isReturn: Boolean(metadata.isReturn),
        });
      }, 0);
      const taxTotal = Number((subtotal * VAT_RATE).toFixed(2));
      await tx.order.update({
        where: { id: order.id, tenantId },
        data: {
          subtotal,
          taxTotal,
          total: Number((subtotal + taxTotal).toFixed(2)),
          metadata: {
            ...normalizeMetadata(order.metadata),
            tableKey: tableId,
            lastMutationId: mutationId,
            updatedAtMs: Date.now(),
          },
        },
      });
      logTableOrderEvent('totals-updated', {
        traceId,
        tenantId,
        tableId,
        orderId: order.id,
        itemCount: nextItems.length,
        subtotal,
        taxTotal,
        total: Number((subtotal + taxTotal).toFixed(2)),
      });
      updatedOrderId = order.id;
      updatedLineCount = nextItems.length;
    });

    logTableOrderEvent('transaction-committed', {
      traceId,
      tenantId,
      tableId,
      mutationId,
    });

    await publishTenantEvent(tenantId, 'orders', {
      type: 'order.updated',
      tableId,
      mutationId,
    }).catch(() => undefined);
    await recordOperationalEvent({
      tenantId,
      branchId: tenant.branchId,
      userId: tenant.userId,
      type: 'order.product_added',
      message: `${productName} masaya eklendi.`,
      entity: 'order',
      entityId: updatedOrderId,
      source: 'pos.table-orders',
      metadata: {
        tableId,
        mutationId,
        productId: product?.id,
        posKey: identity.posKey,
        catalogRevision,
        quantityToAdd,
        lineCount: updatedLineCount,
      },
    }).catch(() => undefined);

    const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId);
    logTableOrderEvent('response-ready', {
      traceId,
      tenantId,
      tableId,
      mutationId,
      tableCount: Object.keys(ordersByTable).length,
      activeLineCount: ordersByTable[tableId]?.length ?? 0,
    });
    return NextResponse.json({ ok: true, source: 'db', mutationId, ordersByTable });
  } catch (error) {
    return mutationErrorResponse(error, traceId, tenantId, tableId);
  }
}
