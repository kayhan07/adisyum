import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { recordOperationalEvent } from '@/lib/operations/live-ops';
import { inferProductDomainType, isSellableProductType, resolvePosFacingProductDomainType } from '@/lib/product-domain';
import { isUuidIdentity, resolveProductIdentity } from '@/lib/product-identity';
import { isRuntimeVisibleProduct } from '@/lib/product-lifecycle-governance';

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
      };
    } | null;

    traceId = mutationTraceId(body?.mutationId?.trim());
    tableId = body?.tableId?.trim() ?? '';
    const product = body?.product;
    const productName = product?.name?.trim();
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
      tableId,
      productId: product?.id,
      productUuid: product?.productId,
      posKey: identity.posKey,
      catalogRevision: product?.catalogRevision,
      legacyKey: identity.legacyKey,
      productName,
      price,
      quantityToAdd,
    });

    if (!tableId || !productName || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantityToAdd)) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid product mutation payload.',
        traceId,
        tableId,
        productName,
        price,
        quantityToAdd,
      }, { status: 400 });
    }

    const requestedProductType = inferProductDomainType({
      name: productName,
      category: product?.category,
      explicitType: product?.productType,
    });
    if (!isSellableProductType(requestedProductType)) {
      return NextResponse.json({
        ok: false,
        error: 'Inventory-only stock items cannot be added to POS orders.',
        code: 'inventory_item_not_sellable',
        traceId,
        tableId,
        productName,
        productType: requestedProductType,
      }, { status: 400 });
    }

    const dbProductId = product?.productId || (isUuid(product?.id) ? product?.id : undefined);
    if (dbProductId) {
      const persistedProduct = await prisma.product.findFirst({
        where: { tenantId, id: dbProductId },
        select: {
          id: true,
          productType: true,
          active: true,
          lifecycleStatus: true,
          publishStatus: true,
          deletedAt: true,
          name: true,
          categoryId: true,
          price: true,
        },
      });
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
        return NextResponse.json({
          ok: false,
          error: 'This product is not published for POS runtime.',
          code: 'product_not_runtime_visible',
          traceId,
          tableId,
          productId: persistedProduct.id,
          productName: persistedProduct.name,
          productType: persistedProduct.productType,
          lifecycleStatus: persistedProduct.lifecycleStatus,
          publishStatus: persistedProduct.publishStatus,
          resolvedProductType: persistedProductType,
        }, { status: 400 });
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
      posKey: identity.posKey,
      catalogRevision: product?.catalogRevision,
      legacyKey: identity.legacyKey,
      sku: identity.sku,
      barcode: identity.barcode,
      externalId: identity.externalId,
      revision: product?.revision ?? 1,
      name: productName,
      price,
      category: product?.category ?? 'mutfak',
      printCategory: product?.printCategory ?? product?.category ?? 'mutfak',
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
              productSnapshot: {
                productId: productInput.id || undefined,
                posKey: productInput.posKey,
                name: productInput.name,
                category: productInput.category,
                printCategory: productInput.printCategory,
                price: productInput.price,
                revision: productInput.revision,
                catalogRevision: productInput.catalogRevision,
                sku: productInput.sku,
                barcode: productInput.barcode,
                externalId: productInput.externalId,
                legacyKey: productInput.legacyKey,
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
              productSnapshot: {
                productId: productInput.id || undefined,
                posKey: productInput.posKey,
                name: productInput.name,
                category: productInput.category,
                printCategory: productInput.printCategory,
                price: productInput.price,
                revision: productInput.revision,
                catalogRevision: productInput.catalogRevision,
                sku: productInput.sku,
                barcode: productInput.barcode,
                externalId: productInput.externalId,
                legacyKey: productInput.legacyKey,
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
        catalogRevision: product?.catalogRevision,
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
