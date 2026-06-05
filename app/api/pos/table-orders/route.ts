import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { recordOperationalEvent } from '@/lib/operations/live-ops';
import { inferProductDomainType, isSellableProductType, resolvePosFacingProductDomainType, type ProductDomainType } from '@/lib/product-domain';
import { validateProductDomainGraph } from '@/lib/product-domain-graph';
import { isUuidIdentity, resolveProductIdentity } from '@/lib/product-identity';
import { isRuntimeVisibleProduct } from '@/lib/product-lifecycle-governance';
import { compileTenantPosCatalog } from '@/lib/server/runtime-pos-catalog';
import type { CanonicalPosCatalog, CanonicalPosCatalogItem } from '@/lib/canonical-pos-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAT_RATE = 0.1;
const ROUTE_BOOTED_AT = new Date().toISOString();
const TABLE_PAYMENT_STATE_KEY = 'table-payment-state';

console.info('[pos-table-orders] route initialized', {
  timestamp: ROUTE_BOOTED_AT,
  runtime,
  dynamic,
  handlers: ['GET', 'POST'],
});

type OrderLinePayload = {
  id: string;
  clientMutationId?: string;
  orderRevision?: number;
  updatedAtMs?: number;
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

type ProductMutationPayload = {
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

function publishTenantOrderEventBestEffort(
  tenantId: string,
  payload: {
    type: string;
    tableId?: string;
    mutationId?: string;
    [key: string]: unknown;
  },
) {
  void publishTenantEvent(tenantId, 'orders', payload).catch((eventError) => {
    console.warn('[pos-table-orders] tenant event publish failed', {
      timestamp: new Date().toISOString(),
      tenantId,
      tableId: payload.tableId,
      mutationId: payload.mutationId,
      eventType: payload.type,
      sideEffectOnly: true,
      orderPersistenceUnaffected: true,
      error: eventError instanceof Error ? eventError.message : String(eventError),
    });
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

function extractIncludedVat(grossTotal: number) {
  return Number((grossTotal - (grossTotal / (1 + VAT_RATE))).toFixed(2));
}

function normalizeMetadata(input: Prisma.JsonValue | null | undefined) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function compactJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => compactJsonValue(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value === 'object') {
    return compactJsonObject(value as Record<string, unknown>);
  }
  return undefined;
}

function compactJsonObject(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, compactJsonValue(value)] as const)
      .filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}

function tablePaymentStateKey(branchId?: string | null) {
  return `${TABLE_PAYMENT_STATE_KEY}:${branchId || 'global'}`;
}

function branchMatches(metadata: Record<string, unknown>, branchId?: string | null) {
  if (!branchId) return true;
  const metadataBranchId = typeof metadata.branchId === 'string' ? metadata.branchId : null;
  return !metadataBranchId || metadataBranchId === branchId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | null | undefined, fields: string[]) {
  if (!source) return undefined;
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberField(source: Record<string, unknown> | null | undefined, fields: string[]) {
  if (!source) return undefined;
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function booleanField(source: Record<string, unknown> | null | undefined, fields: string[]) {
  if (!source) return undefined;
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function extractProductItem(body: Record<string, unknown>) {
  if (isRecord(body.product)) return body.product;
  if (isRecord(body.item)) return body.item;
  if (isRecord(body.orderItem)) return body.orderItem;
  if (isRecord(body.line)) return body.line;
  if (Array.isArray(body.items)) {
    const firstItem = body.items.find(isRecord);
    if (firstItem) return firstItem;
  }
  if (stringField(body, ['productId', 'id', 'posKey', 'name', 'title'])) return body;
  return null;
}

function normalizeProductMutationPayload(item: Record<string, unknown> | null): ProductMutationPayload | null {
  if (!item) return null;
  const snapshot = isRecord(item.productSnapshot)
    ? item.productSnapshot
    : isRecord(item.snapshot)
      ? item.snapshot
      : null;
  const quantity = numberField(item, ['quantity', 'qty', 'count']) ?? 1;
  const total = numberField(item, ['total', 'lineTotal', 'line_total']);
  const unitPrice = numberField(item, ['price', 'unitPrice', 'unit_price'])
    ?? (total !== undefined && quantity > 0 ? total / quantity : undefined);
  const productId = stringField(item, ['productId', 'product_id']) ?? stringField(snapshot, ['productId', 'id']);
  const id = stringField(item, ['id']) ?? productId ?? stringField(snapshot, ['id', 'productId', 'posKey']);
  const posKey = stringField(item, ['posKey', 'pos_key', 'productKey', 'product_key'])
    ?? stringField(snapshot, ['posKey'])
    ?? productId
    ?? id;
  const name = stringField(item, ['name', 'title', 'label']) ?? stringField(snapshot, ['name', 'title']);

  return {
    id,
    productId,
    posKey,
    catalogRevision: stringField(item, ['catalogRevision', 'catalog_revision']) ?? stringField(snapshot, ['catalogRevision']),
    sku: stringField(item, ['sku']) ?? stringField(snapshot, ['sku']),
    barcode: stringField(item, ['barcode']) ?? stringField(snapshot, ['barcode']),
    externalId: stringField(item, ['externalId', 'external_id']) ?? stringField(snapshot, ['externalId']),
    legacyKey: stringField(item, ['legacyKey', 'legacy_key']) ?? stringField(snapshot, ['legacyKey']),
    revision: numberField(item, ['revision', 'productRevision', 'product_revision']) ?? numberField(snapshot, ['revision']),
    productSnapshot: snapshot ?? undefined,
    name,
    productType: stringField(item, ['productType', 'product_type', 'type']) ?? stringField(snapshot, ['productType']),
    price: unitPrice,
    category: stringField(item, ['category', 'categoryId', 'category_id']) ?? stringField(snapshot, ['category', 'categoryId']),
    printCategory: stringField(item, ['printCategory', 'print_category']),
    quantity,
    note: stringField(item, ['note', 'notes']),
    guestName: stringField(item, ['guestName', 'guest_name']),
    spicePreference: stringField(item, ['spicePreference', 'spice_preference']) as OrderLinePayload['spicePreference'],
    cookingPreference: stringField(item, ['cookingPreference', 'cooking_preference']) as OrderLinePayload['cookingPreference'],
    extrasNote: stringField(item, ['extrasNote', 'extras_note']),
    removalNote: stringField(item, ['removalNote', 'removal_note']),
    complimentary: booleanField(item, ['complimentary']),
    complimentaryReason: stringField(item, ['complimentaryReason', 'complimentary_reason']),
    isReturn: booleanField(item, ['isReturn', 'is_return']),
    allowDiscount: booleanField(item, ['allowDiscount', 'allow_discount']),
    allowComplimentary: booleanField(item, ['allowComplimentary', 'allow_complimentary']),
    happyHourEligible: booleanField(item, ['happyHourEligible', 'happy_hour_eligible']),
  };
}

function normalizeTableOrderMutationBody(body: unknown) {
  const record = isRecord(body) ? body : {};
  const table = isRecord(record.table) ? record.table : null;
  const payment = isRecord(record.payment) ? record.payment : {};
  const receivedItem = extractProductItem(record);
  const product = normalizeProductMutationPayload(receivedItem);
  return {
    action: stringField(record, ['action', 'type', 'mutationType']),
    mutationId: stringField(record, ['mutationId', 'mutation_id', 'clientMutationId']),
    tableId: stringField(record, ['tableId', 'tableKey', 'tableNo', 'table_id', 'table_key', 'table_no'])
      ?? stringField(table, ['id', 'key', 'no', 'tableId', 'tableKey', 'tableNo'])
      ?? '',
    lineId: stringField(record, ['lineId', 'orderItemId', 'line_id', 'order_item_id']),
    quantity: numberField(record, ['quantity', 'qty']),
    payment: {
      amount: numberField(payment, ['amount', 'total']),
      method: stringField(payment, ['method', 'paymentMethod', 'payment_method']) ?? 'unknown',
      scope: stringField(payment, ['scope', 'paymentScope', 'payment_scope']) ?? 'full',
      currency: stringField(payment, ['currency']) ?? 'TRY',
      receivedAt: stringField(payment, ['receivedAt', 'received_at']),
      reconciliationKey: stringField(payment, ['reconciliationKey', 'reconciliation_key']),
      cashAmount: numberField(payment, ['cashAmount', 'cash_amount']),
      cardAmount: numberField(payment, ['cardAmount', 'card_amount']),
      accountAmount: numberField(payment, ['accountAmount', 'account_amount']),
      accountId: stringField(payment, ['accountId', 'account_id']),
      accountName: stringField(payment, ['accountName', 'account_name']),
      accountType: stringField(payment, ['accountType', 'account_type']),
    },
    product,
    receivedItem,
  };
}

function buildRecoveryCatalogItem(input: {
  product: ProductMutationPayload;
  productSnapshot: Record<string, unknown>;
  posKey: string;
  catalogRevision: string;
  productName: string;
  productType: ProductDomainType;
  price: number;
}): CanonicalPosCatalogItem {
  const revision = Number(input.productSnapshot.revision ?? input.product.revision ?? 1);
  const category = input.product.category
    ?? (typeof input.productSnapshot.category === 'string' ? input.productSnapshot.category : undefined)
    ?? 'Mutfak';
  const productId = input.product.productId
    ?? (typeof input.productSnapshot.productId === 'string' ? input.productSnapshot.productId : undefined)
    ?? (isUuid(input.product.id) ? input.product.id : undefined);

  return {
    id: input.posKey,
    productId,
    posKey: input.posKey,
    sku: input.product.sku,
    barcode: input.product.barcode,
    externalId: input.product.externalId,
    legacyKey: input.product.legacyKey ?? input.productName,
    revision: Number.isFinite(revision) && revision > 0 ? revision : 1,
    lifecycleStatus: 'published',
    publishStatus: 'published',
    deletedAt: null,
    name: input.productName,
    category,
    productType: input.productType,
    printCategory: input.product.printCategory ?? category,
    salesUnit: 'portion',
    price: input.price,
    vatRate: VAT_RATE,
    allowComplimentary: input.product.allowComplimentary ?? true,
    allowDiscount: input.product.allowDiscount ?? true,
    happyHourEligible: input.product.happyHourEligible ?? false,
    catalogRevision: input.catalogRevision,
    productSnapshot: {
      productId,
      posKey: input.posKey,
      name: input.productName,
      category,
      productType: input.productType,
      price: input.price,
      vatRate: VAT_RATE,
      revision: Number.isFinite(revision) && revision > 0 ? revision : 1,
      sku: input.product.sku,
      barcode: input.product.barcode,
      externalId: input.product.externalId,
      legacyKey: input.product.legacyKey ?? input.productName,
      lifecycleStatus: 'published',
      publishStatus: 'published',
    },
    branchOverlay: {
      visible: true,
      available: true,
    },
  };
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
    clientMutationId: typeof metadata.mutationId === 'string' ? metadata.mutationId : undefined,
    orderRevision: typeof metadata.updatedAtMs === 'number' ? metadata.updatedAtMs : undefined,
    updatedAtMs: typeof metadata.updatedAtMs === 'number' ? metadata.updatedAtMs : undefined,
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

function buildCatalogIdentityIndex(catalog: CanonicalPosCatalog) {
  const productIds = new Set<string>();
  const posKeys = new Set<string>();

  for (const item of catalog.items) {
    if (item.productId) productIds.add(item.productId);
    if (item.posKey) posKeys.add(item.posKey);
    if (item.productSnapshot.productId) productIds.add(item.productSnapshot.productId);
    if (item.productSnapshot.posKey) posKeys.add(item.productSnapshot.posKey);
  }

  return { productIds, posKeys };
}

function orderItemBelongsToCurrentCatalog(
  item: {
    productId: string | null;
    metadata: Prisma.JsonValue;
  },
  catalogIndex: ReturnType<typeof buildCatalogIdentityIndex>,
  tenantProductIds: Set<string>,
  tenantId: string,
) {
  const metadata = normalizeMetadata(item.metadata);
  const posKey = typeof metadata.posKey === 'string'
    ? metadata.posKey
    : typeof metadata.productKey === 'string'
      ? metadata.productKey
      : undefined;
  const snapshot = normalizeMetadata(metadata.productSnapshot as Prisma.JsonValue);
  const snapshotProductId = typeof snapshot.productId === 'string' ? snapshot.productId : undefined;
  const snapshotPosKey = typeof snapshot.posKey === 'string' ? snapshot.posKey : undefined;
  const metadataSource = typeof metadata.source === 'string' ? metadata.source : undefined;
  const serverStampedTenantMatch = metadata.tenantId === tenantId
    && Boolean(posKey || snapshotPosKey || snapshotProductId || item.productId)
    && (
      metadata.runtimeIdentityMode === 'catalog'
      || metadataSource === 'pos-table-orders'
      || isRecord(metadata.productSnapshot)
      || Boolean(snapshotPosKey)
    );

  return Boolean(
    serverStampedTenantMatch
      || (item.productId && tenantProductIds.has(item.productId))
      || (item.productId && catalogIndex.productIds.has(item.productId))
      || (snapshotProductId && catalogIndex.productIds.has(snapshotProductId))
      || (posKey && catalogIndex.posKeys.has(posKey))
      || (snapshotPosKey && catalogIndex.posKeys.has(snapshotPosKey)),
  );
}

async function loadAuthoritativeOrdersByTable(tenantId: string, branchId?: string) {
  const catalog = await compileTenantPosCatalog(tenantId, branchId, 'pos');
  const catalogIndex = buildCatalogIdentityIndex(catalog);

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
  const linkedProductIds = Array.from(new Set(
    items
      .map((item) => item.productId)
      .filter((productId): productId is string => Boolean(productId)),
  ));
  const tenantProducts = linkedProductIds.length > 0
    ? await prisma.product.findMany({
        where: {
          tenantId,
          id: { in: linkedProductIds },
          active: true,
          deletedAt: null,
        },
        select: { id: true },
      })
    : [];
  const tenantProductIds = new Set(tenantProducts.map((product) => product.id));

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push(item);
    itemsByOrder.set(item.orderId, current);
  }

  return Object.fromEntries(
    orders
      .filter((order) => branchMatches(normalizeMetadata(order.metadata), branchId))
      .map((order) => {
      const metadata = normalizeMetadata(order.metadata);
      const tableId = typeof metadata.tableKey === 'string'
        ? metadata.tableKey
        : order.orderNo.startsWith('TABLE-')
          ? order.orderNo.slice('TABLE-'.length)
          : String(order.tableId ?? '');
      return [
        tableId,
        (itemsByOrder.get(order.id) ?? [])
          .filter((item) => orderItemBelongsToCurrentCatalog(item, catalogIndex, tenantProductIds, tenantId))
          .map(itemToLine),
      ] as const;
    })
      .filter(([, lines]) => lines.length > 0),
  ) as Record<string, OrderLinePayload[]>;
}

async function loadAuthoritativeOrderDiagnostics(tenantId: string, ordersByTable: Record<string, OrderLinePayload[]>, branchId?: string | null) {
  const openOrders = await prisma.order.findMany({
    where: { tenantId, status: 'open', orderNo: { startsWith: 'TABLE-' } },
    select: { id: true, metadata: true },
    take: 500,
  });
  const openOrderIds = openOrders
    .filter((order) => branchMatches(normalizeMetadata(order.metadata), branchId))
    .map((order) => order.id);
  const openItemCount = openOrderIds.length > 0
    ? await prisma.orderItem.count({ where: { tenantId, orderId: { in: openOrderIds } } })
    : 0;
  const visibleLineCount = Object.values(ordersByTable).reduce((sum, lines) => sum + lines.length, 0);

  return {
    tenantId,
    openOrderCount: openOrders.length,
    openItemCount,
    visibleTableCount: Object.keys(ordersByTable).length,
    visibleLineCount,
  };
}

async function persistAuthoritativeRuntimeTableState(input: {
  tenantId: string;
  branchId?: string | null;
  ordersByTable: Record<string, OrderLinePayload[]>;
  paymentState?: unknown;
  source: string;
}) {
  const activeTableIds = Object.keys(input.ordersByTable).filter((tableId) => input.ordersByTable[tableId]?.length > 0);
  const liveTotals = Object.fromEntries(
    Object.entries(input.ordersByTable).map(([tableId, lines]) => [
      tableId,
      Number(lines.reduce((sum, line) => sum + getLineSubtotal(line), 0).toFixed(2)),
    ]),
  );
  const stateMeta = {
    version: Date.now(),
    tenantId: input.tenantId,
    branchId: input.branchId ?? null,
    updatedAtMs: Date.now(),
    clientId: 'server-pos-table-orders',
    mutationId: `server-${Date.now()}`,
    source: input.source,
    activeOrderTables: activeTableIds,
  };
  const payload = JSON.parse(JSON.stringify({
    paymentRequestedTableIds: [],
    liveTotals,
    ordersByTable: input.ordersByTable,
    tableMeta: {},
    stateMeta,
    paymentState: input.paymentState ?? null,
    updatedAt: new Date().toISOString(),
  })) as Prisma.InputJsonObject;
  const key = tablePaymentStateKey(input.branchId);

  await prisma.runtimeState.upsert({
    where: runtimeStateTenantKey(input.tenantId, key),
    update: { payload },
    create: { tenantId: input.tenantId, key, payload },
  });

  return { key, state: payload };
}

type PaymentLedgerOrder = {
  id: string;
  metadata: Prisma.JsonValue;
  status: string;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
};

async function loadPaymentState(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  order: PaymentLedgerOrder,
) {
  const [itemTotals, payments] = await Promise.all([
    db.orderItem.aggregate({
      where: { tenantId, orderId: order.id },
      _sum: { total: true },
    }),
    db.payment.findMany({
      where: { tenantId, orderId: order.id, status: 'paid' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        method: true,
        amount: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);
  const orderMetadata = normalizeMetadata(order.metadata);
  const itemTotal = decimalToNumber(itemTotals._sum.total);
  const preservedOrderTotal = Number(orderMetadata.prePaymentLineTotal ?? 0);
  const orderTotal = Number((
    itemTotal
    || (Number.isFinite(preservedOrderTotal) ? preservedOrderTotal : 0)
    || decimalToNumber(order.subtotal)
    || decimalToNumber(order.total)
  ).toFixed(2));
  const paidTotal = Number(payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0).toFixed(2));
  const remainingTotal = order.status === 'paid'
    ? 0
    : Number(Math.max(orderTotal - paidTotal, 0).toFixed(2));

  return {
    orderId: order.id,
    orderStatus: order.status,
    orderTotal,
    paidTotal,
    remainingTotal,
    payments: payments.map((payment) => {
      const metadata = normalizeMetadata(payment.metadata);
      return {
        id: payment.id,
        method: payment.method,
        amount: decimalToNumber(payment.amount),
        currency: typeof metadata.currency === 'string' ? metadata.currency : 'TRY',
        receivedAt: typeof metadata.receivedAt === 'string' ? metadata.receivedAt : payment.createdAt.toISOString(),
        reconciliationKey: typeof metadata.reconciliationKey === 'string'
          ? metadata.reconciliationKey
          : typeof metadata.mutationId === 'string'
            ? metadata.mutationId
            : payment.id,
        cashAmount: typeof metadata.cashAmount === 'number'
          ? metadata.cashAmount
          : payment.method === 'cash'
            ? decimalToNumber(payment.amount)
            : 0,
        accountAmount: typeof metadata.accountAmount === 'number'
          ? metadata.accountAmount
          : payment.method === 'account'
            ? decimalToNumber(payment.amount)
            : 0,
      };
    }),
  };
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const ordersByTable = await loadAuthoritativeOrdersByTable(tenant.tenantId, tenant.branchId ?? undefined);
    const diagnostics = await loadAuthoritativeOrderDiagnostics(tenant.tenantId, ordersByTable, tenant.branchId ?? undefined);
    return NextResponse.json({ ok: true, ordersByTable, source: 'db', diagnostics });
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
    const body = await request.json().catch(() => null);
    const normalizedBody = normalizeTableOrderMutationBody(body);

    traceId = mutationTraceId(normalizedBody.mutationId);
    tableId = normalizedBody.tableId;
    if (normalizedBody.action === 'save_order' || normalizedBody.action === 'mark_order_sent') {
      if (!tableId) {
        return runtimeInsertionErrorResponse({
          status: 400,
          reason: 'missing_tableId',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      const orderNo = tableOrderNo(tableId);
      const order = await prisma.order.findUnique({
        where: { tenantId_orderNo: { tenantId, orderNo } },
        select: { id: true, metadata: true },
      });

      if (!order) {
        return runtimeInsertionErrorResponse({
          status: 404,
          reason: 'order_not_found',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      await prisma.$transaction(async (tx) => {
        const items = await tx.orderItem.findMany({
          where: { tenantId, orderId: order.id },
          select: { id: true, quantity: true, metadata: true },
        });

        if (normalizedBody.action === 'mark_order_sent') {
          await Promise.all(items.map((item) => {
            const metadata = normalizeMetadata(item.metadata);
            return tx.orderItem.update({
              where: { id: item.id, tenantId },
              data: {
                metadata: compactJsonObject({
                  ...metadata,
                  sentQty: decimalToNumber(item.quantity),
                  mutationId: normalizedBody.mutationId,
                  sentAt: new Date().toISOString(),
                  updatedAtMs: Date.now(),
                }),
              },
            });
          }));
        }

        await tx.order.update({
          where: { id: order.id, tenantId },
          data: {
            status: 'open',
            metadata: {
              ...normalizeMetadata(order.metadata),
              tableKey: tableId,
              branchId: tenant.branchId,
              lastMutationId: normalizedBody.mutationId,
              savedAt: new Date().toISOString(),
              updatedAtMs: Date.now(),
            },
          },
        });
      });

      publishTenantOrderEventBestEffort(tenantId, {
        type: normalizedBody.action === 'mark_order_sent' ? 'order.sent' : 'order.saved',
        tableId,
        mutationId: normalizedBody.mutationId,
      });

      const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId, tenant.branchId ?? undefined);
      return NextResponse.json({ ok: true, source: 'db', mutationId: normalizedBody.mutationId, ordersByTable, authoritativeState: { ordersByTable } });
    }

    if (normalizedBody.action === 'clear_table' || normalizedBody.action === 'delete_table') {
      if (!tableId) {
        return runtimeInsertionErrorResponse({
          status: 400,
          reason: 'missing_tableId',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      const orderNo = tableOrderNo(tableId);
      const order = await prisma.order.findUnique({
        where: { tenantId_orderNo: { tenantId, orderNo } },
        select: { id: true, metadata: true, subtotal: true, total: true },
      });

      if (order && branchMatches(normalizeMetadata(order.metadata), tenant.branchId ?? undefined)) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${order.id}))`;
          await tx.orderItem.deleteMany({ where: { tenantId, orderId: order.id } });
          await tx.order.update({
            where: { id: order.id, tenantId },
            data: {
              status: 'paid',
              subtotal: 0,
              discount: 0,
              taxTotal: 0,
              total: 0,
              metadata: compactJsonObject({
                ...normalizeMetadata(order.metadata),
                tableKey: tableId,
                branchId: tenant.branchId,
                lastMutationId: normalizedBody.mutationId,
                closedBy: normalizedBody.action,
                clearedAt: new Date().toISOString(),
                preClearSubtotal: decimalToNumber(order.subtotal),
                preClearTotal: decimalToNumber(order.total),
                updatedAtMs: Date.now(),
              }),
            },
          });
        });
      }

      publishTenantOrderEventBestEffort(tenantId, {
        type: normalizedBody.action === 'delete_table' ? 'order.table_deleted' : 'order.cleared',
        tableId,
        mutationId: normalizedBody.mutationId,
      });

      const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId, tenant.branchId ?? undefined);
      const runtimeTableState = await persistAuthoritativeRuntimeTableState({
        tenantId,
        branchId: tenant.branchId,
        ordersByTable,
        source: normalizedBody.action,
      });

      return NextResponse.json({
        ok: true,
        source: 'db',
        mutationId: normalizedBody.mutationId,
        ordersByTable,
        authoritativeState: {
          ordersByTable,
          runtimeTableStateKey: runtimeTableState.key,
          runtimeTableState: runtimeTableState.state,
        },
      });
    }

    if (normalizedBody.action === 'update_line_quantity' || normalizedBody.action === 'remove_line') {
      const lineId = normalizedBody.lineId;
      const nextQuantity = normalizedBody.action === 'remove_line'
        ? 0
        : Math.max(0, Number(normalizedBody.quantity ?? 0) || 0);

      if (!tableId || !lineId) {
        return runtimeInsertionErrorResponse({
          status: 400,
          reason: !tableId ? 'missing_tableId' : 'missing_lineId',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      const orderNo = tableOrderNo(tableId);
      const order = await prisma.order.findUnique({
        where: { tenantId_orderNo: { tenantId, orderNo } },
        select: { id: true, metadata: true },
      });

      if (!order) {
        return runtimeInsertionErrorResponse({
          status: 404,
          reason: 'order_not_found',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
          details: { lineId },
        });
      }

      const existingLine = await prisma.orderItem.findFirst({
        where: { tenantId, orderId: order.id, id: lineId },
        select: { id: true },
      });

      if (!existingLine) {
        return runtimeInsertionErrorResponse({
          status: 404,
          reason: 'order_line_not_found',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
          details: { lineId },
        });
      }

      await prisma.$transaction(async (tx) => {
        const existingItem = await tx.orderItem.findFirst({
          where: { tenantId, orderId: order.id, id: lineId },
          select: { id: true, unitPrice: true, metadata: true },
        });

        if (!existingItem) {
          return;
        }

        if (nextQuantity <= 0) {
          await tx.orderItem.delete({ where: { id: lineId, tenantId } });
        } else {
          const metadata = normalizeMetadata(existingItem.metadata);
          await tx.orderItem.update({
            where: { id: lineId, tenantId },
            data: {
              quantity: nextQuantity,
              total: getLineSubtotal({
                qty: nextQuantity,
                price: decimalToNumber(existingItem.unitPrice),
                complimentary: Boolean(metadata.complimentary),
                isReturn: Boolean(metadata.isReturn),
              }),
              metadata: compactJsonObject({
                ...metadata,
                qty: nextQuantity,
                sentQty: Math.min(typeof metadata.sentQty === 'number' ? metadata.sentQty : 0, nextQuantity),
                mutationId: normalizedBody.mutationId,
                updatedAtMs: Date.now(),
              }),
            },
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
        const taxTotal = extractIncludedVat(subtotal);
        await tx.order.update({
          where: { id: order.id, tenantId },
          data: {
            status: nextItems.length > 0 ? 'open' : 'paid',
            subtotal,
            taxTotal,
            total: Number(subtotal.toFixed(2)),
            metadata: {
              ...normalizeMetadata(order.metadata),
              tableKey: tableId,
              branchId: tenant.branchId,
              lastMutationId: normalizedBody.mutationId,
              updatedAtMs: Date.now(),
            },
          },
        });
      });

      publishTenantOrderEventBestEffort(tenantId, {
        type: normalizedBody.action === 'remove_line' ? 'order.item.removed' : 'order.item.quantity_updated',
        tableId,
        lineId,
        quantity: nextQuantity,
        mutationId: normalizedBody.mutationId,
      });

      const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId, tenant.branchId ?? undefined);
      return NextResponse.json({ ok: true, source: 'db', mutationId: normalizedBody.mutationId, ordersByTable, authoritativeState: { ordersByTable } });
    }

    if (
      normalizedBody.action === 'get_payment_state'
      || normalizedBody.action === 'add_partial_payment'
      || normalizedBody.action === 'finalize_payment'
      || normalizedBody.action === 'cancel_partial_payment'
      || normalizedBody.action === 'close_table_payment'
      || normalizedBody.action === 'payment_completed'
    ) {
      if (!tableId) {
        return runtimeInsertionErrorResponse({
          status: 400,
          reason: 'missing_tableId',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      const orderNo = tableOrderNo(tableId);
      const order = await prisma.order.findUnique({
        where: { tenantId_orderNo: { tenantId, orderNo } },
        select: { id: true, metadata: true, status: true, subtotal: true, total: true },
      });

      if (!order) {
        return runtimeInsertionErrorResponse({
          status: 409,
          reason: 'order_not_found_for_payment',
          traceId,
          tenantId,
          branchId: tenant.branchId,
          tableId,
        });
      }

      if (normalizedBody.action === 'get_payment_state') {
        const paymentState = await loadPaymentState(prisma, tenantId, order);
        return NextResponse.json({ ok: true, source: 'db', paymentState });
      }

      const reconciliationKey = normalizedBody.payment.reconciliationKey || normalizedBody.mutationId || traceId;
      const receivedAt = normalizedBody.payment.receivedAt || new Date().toISOString();
      const transactionResult = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${order.id}))`;
        let currentState = await loadPaymentState(tx, tenantId, order);

        if (normalizedBody.action === 'cancel_partial_payment') {
          const matchingPayment = currentState.payments.find((payment) => payment.reconciliationKey === reconciliationKey);
          if (!matchingPayment) throw new Error('İptal edilecek parçalı tahsilat bulunamadı.');
          if (currentState.orderStatus === 'paid') throw new Error('Kapanmış adisyonda tahsilat iptal edilemez.');
          await tx.payment.update({
            where: { id: matchingPayment.id, tenantId },
            data: {
              status: 'voided',
              metadata: compactJsonObject({
                cancelledAt: new Date().toISOString(),
                cancellationMutationId: normalizedBody.mutationId,
              }),
            },
          });
          if (matchingPayment.cashAmount > 0) {
            await tx.cashTransaction.create({
              data: {
                tenantId,
                type: 'pos_payment_void',
                amount: -matchingPayment.cashAmount,
                note: `${tableId} masa tahsilat iptali`,
                metadata: compactJsonObject({
                  orderId: order.id,
                  paymentId: matchingPayment.id,
                  tableKey: tableId,
                  mutationId: normalizedBody.mutationId,
                  reconciliationKey,
                  source: 'pos-table-orders',
                  receivedAt: new Date().toISOString(),
                }),
              },
            });
          }
          if (matchingPayment.accountAmount > 0) {
            const paymentRecord = await tx.payment.findUnique({
              where: { id: matchingPayment.id, tenantId },
              select: { metadata: true },
            });
            const paymentMetadata = normalizeMetadata(paymentRecord?.metadata);
            const accountId = typeof paymentMetadata.accountId === 'string' ? paymentMetadata.accountId : '';
            if (accountId) {
              const totals = await tx.currentAccountMovement.aggregate({
                where: { tenantId, accountId },
                _sum: { debit: true, credit: true },
              });
              const previousBalance = Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0);
              await tx.currentAccountMovement.upsert({
                where: { tenantId_reconciliationKey: { tenantId, reconciliationKey: `${reconciliationKey}:account-sale-void` } },
                create: {
                  tenantId,
                  accountId,
                  orderId: order.id,
                  paymentId: matchingPayment.id,
                  reconciliationKey: `${reconciliationKey}:account-sale-void`,
                  type: 'REFUND',
                  method: 'cari',
                  credit: matchingPayment.accountAmount,
                  balanceAfter: Number((previousBalance - matchingPayment.accountAmount).toFixed(2)),
                  description: `${tableId} masa cari tahsilat iptali`,
                  metadata: compactJsonObject({
                    source: 'pos-table-orders',
                    tableKey: tableId,
                    branchId: tenant.branchId,
                    accountType: paymentMetadata.accountType,
                  }),
                },
                update: {},
              });
            }
          }
          currentState = await loadPaymentState(tx, tenantId, order);
          await tx.order.update({
            where: { id: order.id, tenantId },
            data: {
              metadata: compactJsonObject({
                ...normalizeMetadata(order.metadata),
                tableKey: tableId,
                paidTotal: currentState.paidTotal,
                remainingTotal: currentState.remainingTotal,
                updatedAtMs: Date.now(),
              }),
            },
          });
          return { paymentCreated: false, paymentState: currentState, closed: false };
        }

        const duplicatePayment = currentState.payments.find((payment) => payment.reconciliationKey === reconciliationKey);
        if (duplicatePayment) {
          console.warn('[pos-table-orders] duplicate payment mutation ignored', {
            timestamp: new Date().toISOString(),
            tenantId,
            tableId,
            orderId: order.id,
            mutationId: normalizedBody.mutationId,
            reconciliationKey,
            existingPaymentId: duplicatePayment.id,
          });
          return { paymentCreated: false, paymentState: currentState, closed: currentState.remainingTotal <= 0 };
        }

        const requestedAmount = Number(normalizedBody.payment.amount ?? 0);
        const paymentAmount = Number((
          Number.isFinite(requestedAmount) && requestedAmount > 0
            ? Math.min(requestedAmount, currentState.remainingTotal)
            : currentState.remainingTotal
        ).toFixed(2));
        if (paymentAmount <= 0) throw new Error('Tahsil edilecek bakiye bulunamadı.');

        const createdPayment = await tx.payment.create({
          data: {
            tenantId,
            orderId: order.id,
            method: normalizedBody.payment.method || 'unknown',
            status: 'paid',
            amount: paymentAmount,
            metadata: compactJsonObject({
              tableKey: tableId,
              branchId: tenant.branchId,
              mutationId: normalizedBody.mutationId,
              reconciliationKey,
              paymentScope: normalizedBody.payment.scope,
              currency: normalizedBody.payment.currency,
              receivedAt,
              cashAmount: normalizedBody.payment.cashAmount,
              cardAmount: normalizedBody.payment.cardAmount,
              accountAmount: normalizedBody.payment.accountAmount,
              accountId: normalizedBody.payment.accountId,
              accountName: normalizedBody.payment.accountName,
              accountType: normalizedBody.payment.accountType,
              source: 'pos-table-orders',
              recordedAt: new Date().toISOString(),
            }),
          },
        });
        const cashAmount = normalizedBody.payment.method === 'cash'
          ? paymentAmount
          : normalizedBody.payment.method === 'mixed'
            ? Math.min(Math.max(normalizedBody.payment.cashAmount ?? 0, 0), paymentAmount)
            : 0;
        if (cashAmount > 0) {
          await tx.cashTransaction.create({
            data: {
              tenantId,
              type: 'pos_payment',
              amount: cashAmount,
              note: `${tableId} masa tahsilatı`,
              metadata: compactJsonObject({
                orderId: order.id,
                tableKey: tableId,
                branchId: tenant.branchId,
                mutationId: normalizedBody.mutationId,
                reconciliationKey,
                paymentMethod: normalizedBody.payment.method,
                source: 'pos-table-orders',
                receivedAt,
              }),
            },
          });
        }
        const accountAmount = normalizedBody.payment.method === 'account'
          ? paymentAmount
          : normalizedBody.payment.method === 'mixed'
            ? Math.min(Math.max(normalizedBody.payment.accountAmount ?? 0, 0), paymentAmount)
            : 0;
        if (accountAmount > 0) {
          const accountId = normalizedBody.payment.accountId;
          if (!accountId) throw new Error('Cari hesap seçilmedi.');
          const totals = await tx.currentAccountMovement.aggregate({
            where: { tenantId, accountId },
            _sum: { debit: true, credit: true },
          });
          const previousBalance = Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0);
          await tx.currentAccountMovement.create({
            data: {
              tenantId,
              accountId,
              orderId: order.id,
              paymentId: createdPayment.id,
              reconciliationKey: `${reconciliationKey}:account-sale`,
              type: 'SALE_DEBT',
              method: 'cari',
              debit: accountAmount,
              balanceAfter: Number((previousBalance + accountAmount).toFixed(2)),
              description: `${tableId} masa adisyonu cari hesaba işlendi`,
              metadata: compactJsonObject({
                tableKey: tableId,
                branchId: tenant.branchId,
                accountName: normalizedBody.payment.accountName,
                accountType: normalizedBody.payment.accountType,
                mutationId: normalizedBody.mutationId,
                source: 'pos-table-orders',
              }),
            },
          });
        }
        currentState = await loadPaymentState(tx, tenantId, order);
        const closesRequestedBalance = normalizedBody.action === 'finalize_payment'
          || normalizedBody.action === 'close_table_payment'
          || normalizedBody.action === 'payment_completed';
        const closed = closesRequestedBalance || currentState.remainingTotal <= 0;
        const discountAmount = closed ? currentState.remainingTotal : 0;
        const persistedPaymentState = closed
          ? { ...currentState, orderStatus: 'paid', remainingTotal: 0 }
          : { ...currentState, orderStatus: 'open' };

        if (closed) await tx.orderItem.deleteMany({ where: { tenantId, orderId: order.id } });
        await tx.order.update({
          where: { id: order.id, tenantId },
          data: {
            status: closed ? 'paid' : 'open',
            subtotal: currentState.orderTotal,
            discount: discountAmount,
            total: Number((currentState.orderTotal - discountAmount).toFixed(2)),
            metadata: compactJsonObject({
              ...normalizeMetadata(order.metadata),
              tableKey: tableId,
              branchId: tenant.branchId,
              lastMutationId: normalizedBody.mutationId,
              paymentAmount,
              paidTotal: persistedPaymentState.paidTotal,
              remainingTotal: persistedPaymentState.remainingTotal,
              prePaymentLineTotal: currentState.orderTotal,
              discountAmount,
              ...(closed ? { paidAt: receivedAt, closedBy: 'pos-table-orders' } : {}),
              updatedAtMs: Date.now(),
            }),
          },
        });

        return { paymentCreated: true, paymentState: persistedPaymentState, closed };
      });

      publishTenantOrderEventBestEffort(tenantId, {
        type: transactionResult.closed ? 'order.paid' : 'order.partial_payment_added',
        tableId,
        mutationId: normalizedBody.mutationId,
        reconciliationKey,
        paidTotal: transactionResult.paymentState.paidTotal,
        remainingTotal: transactionResult.paymentState.remainingTotal,
      });

      const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId, tenant.branchId ?? undefined);
      const runtimeTableState = await persistAuthoritativeRuntimeTableState({
        tenantId,
        branchId: tenant.branchId,
        ordersByTable,
        paymentState: transactionResult.paymentState,
        source: transactionResult.closed ? 'payment-closed' : 'partial-payment',
      });
      return NextResponse.json({
        ok: true,
        source: 'db',
        mutationId: normalizedBody.mutationId,
        reconciliationKey,
        paymentCreated: transactionResult.paymentCreated,
        paymentState: transactionResult.paymentState,
        ordersByTable,
        authoritativeState: {
          ordersByTable,
          paymentState: transactionResult.paymentState,
          runtimeTableStateKey: runtimeTableState.key,
          runtimeTableState: runtimeTableState.state,
        },
      });
    }

    const product = normalizedBody.product;
    let productSnapshot = product?.productSnapshot && typeof product.productSnapshot === 'object'
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
      category: product?.category ?? productSnapshot?.category,
      productName,
      price,
      quantityToAdd,
    });

    if (!tableId || !product || !productName || !Number.isFinite(price) || !Number.isFinite(quantityToAdd)) {
      const missingFields = [
        tableId ? null : 'tableId',
        product ? null : 'product',
        productName ? null : 'product.name',
        Number.isFinite(price) ? null : 'product.price',
        Number.isFinite(quantityToAdd) ? null : 'product.quantity',
      ].filter(Boolean);
      console.error('[pos-table-orders] malformed_order_item', {
        timestamp: new Date().toISOString(),
        traceId,
        tenantId,
        branchId: tenant.branchId,
        receivedBody: body,
        receivedItem: normalizedBody.receivedItem,
        missingFields,
        normalizedItem: product,
      });
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
    let catalogItem = runtimeCatalog.items.find((item) => item.posKey === identity.posKey);
    let catalogItemRecoveredFromPayload = false;
    if (!productSnapshot && catalogItem) {
      productSnapshot = catalogItem.productSnapshot as Record<string, unknown>;
      logTableOrderEvent('runtime-snapshot-backfilled', {
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        posKey: identity.posKey,
        source: 'server-runtime-catalog',
      });
    }
    if (!catalogItem && productSnapshot) {
      catalogItemRecoveredFromPayload = true;
      catalogItem = buildRecoveryCatalogItem({
        product,
        productSnapshot,
        posKey: identity.posKey,
        catalogRevision: runtimeCatalog.catalogRevision,
        productName,
        productType: requestedProductType,
        price,
      });
      console.warn('[pos-table-orders] runtime catalog cache miss recovered from product snapshot', {
        timestamp: new Date().toISOString(),
        traceId,
        tenantId,
        branchId: tenant.branchId,
        tableId,
        posKey: identity.posKey,
        productName,
        clientCatalogRevision,
        serverCatalogRevision: runtimeCatalog.catalogRevision,
      });
    }
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
        status: 409,
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

    const catalogGraph = validateProductDomainGraph({
      id: catalogItem.productSnapshot.productId,
      name: catalogItem.productSnapshot.name,
      category: catalogItem.productSnapshot.category,
      productType: catalogItem.productSnapshot.productType,
      price: catalogItem.productSnapshot.price,
      posKey: catalogItem.productSnapshot.posKey,
      catalogRevision: catalogItem.catalogRevision,
      productSnapshot,
      lifecycleStatus: catalogItem.productSnapshot.lifecycleStatus,
      publishStatus: catalogItem.productSnapshot.publishStatus,
      branchId: tenant.branchId,
    }, { requireRuntimeFields: true });
    logTableOrderEvent('domain-graph-validated', {
      traceId,
      tenantId,
      branchId: tenant.branchId,
      tableId,
      posKey: identity.posKey,
      category: catalogGraph.category.name,
      allowedProductTypes: catalogGraph.category.allowedProductTypes,
      productType: catalogGraph.productType,
      posVisible: catalogGraph.posVisible,
      runtimeVisible: catalogGraph.runtimeVisible,
      issues: catalogGraph.issues,
    });
    if (!catalogGraph.runtimeVisible) {
      return runtimeInsertionErrorResponse({
        status: 409,
        reason: 'invalid_visibility',
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
          category: catalogGraph.category.name,
          productType: catalogGraph.productType,
        },
        details: { issues: catalogGraph.issues },
      });
    }

    if (!catalogItemRecoveredFromPayload && (clientCatalogRevision !== runtimeCatalog.catalogRevision || clientCatalogRevision !== catalogItem.catalogRevision)) {
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

    if (!catalogItemRecoveredFromPayload && (
      productSnapshot.posKey !== catalogItem.productSnapshot.posKey
      || Number(productSnapshot.revision) !== catalogItem.productSnapshot.revision
      || productSnapshot.productType !== catalogItem.productSnapshot.productType
    )) {
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
    const clientProductId = isUuid(product.productId) ? product.productId : undefined;
    const clientRuntimeProductKey = !clientProductId && product.productId ? product.productId : undefined;
    const catalogProductId = isUuid(catalogItem.productSnapshot.productId)
      ? catalogItem.productSnapshot.productId
      : undefined;
    let dbProductId = clientProductId || (isUuid(product.id) ? product.id : undefined) || catalogProductId;
    const dbLookupPosKey = identity.posKey || clientRuntimeProductKey || catalogItem.productSnapshot.posKey;
    const persistedProduct = await prisma.product.findFirst({
      where: dbProductId
        ? { tenantId, id: dbProductId }
        : { tenantId, posKey: dbLookupPosKey },
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
    } else if (product?.id || clientRuntimeProductKey) {
      logTableOrderEvent('product-db-lookup-skipped', {
        traceId,
        tenantId,
        tableId,
        productId: product.id,
        runtimeProductKey: clientRuntimeProductKey,
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
    const mutationId = normalizedBody.mutationId || `${tableId}-${Date.now()}`;
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
            branchId: tenant.branchId,
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
            branchId: tenant.branchId,
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
              tenantId,
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
              tenantId,
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
      const taxTotal = extractIncludedVat(subtotal);
      await tx.order.update({
        where: { id: order.id, tenantId },
        data: {
          subtotal,
          taxTotal,
          total: Number(subtotal.toFixed(2)),
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
        total: Number(subtotal.toFixed(2)),
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

    publishTenantOrderEventBestEffort(tenantId, {
      type: 'order.updated',
      tableId,
      mutationId,
    });
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
    }).catch((eventError) => {
      console.warn('[pos-table-orders] operational event record failed', {
        timestamp: new Date().toISOString(),
        tenantId,
        branchId: tenant.branchId,
        userId: tenant.userId,
        tableId,
        mutationId,
        productId: product?.id,
        error: eventError instanceof Error ? eventError.message : String(eventError),
      });
    });

    const ordersByTable = await loadAuthoritativeOrdersByTable(tenantId, tenant.branchId ?? undefined);
    logTableOrderEvent('response-ready', {
      traceId,
      tenantId,
      tableId,
      mutationId,
      tableCount: Object.keys(ordersByTable).length,
      activeLineCount: ordersByTable[tableId]?.length ?? 0,
    });
    return NextResponse.json({ ok: true, source: 'db', mutationId, ordersByTable, authoritativeState: { ordersByTable } });
  } catch (error) {
    return mutationErrorResponse(error, traceId, tenantId, tableId);
  }
}
