'use client';

import type { ProductDomainType } from '@/lib/product-domain';
import { buildApiUrl, POS_TABLE_ORDERS_API, runtimeFetch } from '@/lib/runtime/runtime-api';

export type RuntimeOrderLine = {
  id: string;
  clientMutationId?: string;
  orderRevision?: number;
  updatedAtMs?: number;
  productId?: string;
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
  productSnapshot?: Record<string, unknown>;
};

export type RuntimeProductSnapshot = {
  id: string;
  productId?: string;
  posKey?: string;
  catalogRevision?: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  revision?: number;
  productSnapshot?: Record<string, unknown>;
  name: string;
  productType?: ProductDomainType;
  price: number;
  category: string;
  printCategory?: string;
  allowDiscount?: boolean;
  allowComplimentary?: boolean;
  happyHourEligible?: boolean;
};

export type OrderMutationProduct = RuntimeProductSnapshot & {
  quantity?: number;
  note?: string;
  guestName?: string;
  spicePreference?: RuntimeOrderLine['spicePreference'];
  cookingPreference?: RuntimeOrderLine['cookingPreference'];
  extrasNote?: string;
  removalNote?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  isReturn?: boolean;
};

export type OrderMutation = {
  tableId: string;
  mutationId: string;
  product: OrderMutationProduct;
  source: string;
};

export type PendingMutation = {
  tableId: string;
  at: number;
  source: string;
};

export type OptimisticLine = RuntimeOrderLine & {
  id: `optimistic-${string}`;
  clientMutationId: string;
};

export type MutationResult<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  ordersByTable: Record<string, TLine[]>;
  mutationId: string;
};

export type MutationReconciliationResult<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  ordersByTable: Record<string, TLine[]>;
  committedLines: TLine[];
  mutationId: string;
};

export type OrderMutationDiagnostics = (event: string, payload: Record<string, unknown>) => void;

let runtimeMutationCreatedCount = 0;
let runtimeMutationDispatchedCount = 0;
let runtimeMutationCommittedCount = 0;
let runtimeMutationRolledBackCount = 0;
const MAX_PENDING_MUTATION_AGE_MS = 10_000;

function readJsonResponse(response: Response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  });
}

export function createMutationId(tableId: string, productId: string) {
  return `${tableId}-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPendingMutation(input: Pick<OrderMutation, 'tableId' | 'source'>): PendingMutation {
  return { tableId: input.tableId, at: Date.now(), source: input.source };
}

export function createOrderMutation(input: {
  tableId: string;
  source: string;
  product: RuntimeProductSnapshot;
  quantity?: number;
  note?: string;
  guestName?: string;
  spicePreference?: RuntimeOrderLine['spicePreference'];
  cookingPreference?: RuntimeOrderLine['cookingPreference'];
  extrasNote?: string;
  removalNote?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  isReturn?: boolean;
}, diagnostics?: OrderMutationDiagnostics) {
  const mutationId = createMutationId(input.tableId, input.product.id);
  runtimeMutationCreatedCount += 1;
  const mutation = {
    tableId: input.tableId,
    mutationId,
    source: input.source,
    product: {
      ...input.product,
      quantity: input.quantity,
      note: input.note,
      guestName: input.guestName,
      spicePreference: input.spicePreference,
      cookingPreference: input.cookingPreference,
      extrasNote: input.extrasNote,
      removalNote: input.removalNote,
      complimentary: input.complimentary,
      complimentaryReason: input.complimentaryReason,
      isReturn: input.isReturn,
    },
  } satisfies OrderMutation;
  diagnostics?.('mutation created', {
    tableId: mutation.tableId,
    mutationId: mutation.mutationId,
    runtimeMutationCreatedCount,
    source: mutation.source,
    productId: mutation.product.id,
    productName: mutation.product.name,
    posKey: mutation.product.posKey,
    catalogRevision: mutation.product.catalogRevision,
  });
  return mutation;
}

export function createOptimisticLine(input: {
  mutation: OrderMutation;
  price: number;
}, diagnostics?: OrderMutationDiagnostics) {
  const now = Date.now();
  const { mutation } = input;
  const line = {
    id: `optimistic-${mutation.mutationId}`,
    clientMutationId: mutation.mutationId,
    orderRevision: now,
    updatedAtMs: now,
    productId: mutation.product.productId ?? mutation.product.id,
    name: mutation.product.name,
    qty: mutation.product.quantity ?? 1,
    note: mutation.product.note ?? '',
    price: mutation.product.complimentary ? 0 : mutation.product.isReturn ? -input.price : input.price,
    category: mutation.product.category,
    printCategory: mutation.product.printCategory ?? mutation.product.category,
    sentQty: 0,
    guestName: mutation.product.guestName ?? '',
    spicePreference: mutation.product.spicePreference ?? 'standart',
    cookingPreference: mutation.product.cookingPreference ?? 'standart',
    extrasNote: mutation.product.extrasNote ?? '',
    removalNote: mutation.product.removalNote ?? '',
    complimentary: Boolean(mutation.product.complimentary),
    complimentaryReason: mutation.product.complimentaryReason ?? '',
    isReturn: Boolean(mutation.product.isReturn),
    allowDiscount: mutation.product.allowDiscount ?? true,
    allowComplimentary: mutation.product.allowComplimentary ?? true,
    happyHourEligible: mutation.product.happyHourEligible ?? false,
    productSnapshot: mutation.product.productSnapshot,
  } satisfies OptimisticLine;
  diagnostics?.('optimistic line created', {
    tableId: mutation.tableId,
    mutationId: mutation.mutationId,
    source: mutation.source,
    lineId: line.id,
    productId: mutation.product.id,
    productName: mutation.product.name,
    quantity: line.qty,
  });
  return line;
}

export function appendOptimisticLine<TLine extends RuntimeOrderLine>(
  current: Record<string, TLine[]>,
  mutation: OrderMutation,
  optimisticLine: TLine,
) {
  const nextLines = [...(current[mutation.tableId] ?? []), optimisticLine];
  return { ...current, [mutation.tableId]: nextLines };
}

export function rollbackOrderMutation<TLine extends RuntimeOrderLine>(
  current: Record<string, TLine[]>,
  mutation: OrderMutation,
) {
  const nextLines = (current[mutation.tableId] ?? []).filter((line) => line.id !== `optimistic-${mutation.mutationId}`);
  return { ...current, [mutation.tableId]: nextLines };
}

export function commitOrderMutation<TLine extends RuntimeOrderLine>(
  mutation: OrderMutation,
  result: MutationResult<TLine>,
) {
  const committedLines = result.ordersByTable[mutation.tableId] ?? [];
  return {
    ordersByTable: result.ordersByTable,
    committedLines,
    mutationId: result.mutationId,
  } satisfies MutationReconciliationResult<TLine>;
}

export async function dispatchOrderMutation<TLine extends RuntimeOrderLine>(
  mutation: OrderMutation,
  diagnostics?: OrderMutationDiagnostics,
) {
  const requestUrl = buildApiUrl(POS_TABLE_ORDERS_API);
  runtimeMutationDispatchedCount += 1;
  diagnostics?.('mutation queued', {
    tableId: mutation.tableId,
    mutationId: mutation.mutationId,
    runtimeMutationDispatchedCount,
    source: mutation.source,
    productId: mutation.product.id,
    posKey: mutation.product.posKey,
    catalogRevision: mutation.product.catalogRevision,
  });
  diagnostics?.('add-product-fetch-dispatch', {
    requestUrl,
    mutationId: mutation.mutationId,
    tableId: mutation.tableId,
    productId: mutation.product.id,
    posKey: mutation.product.posKey,
    catalogRevision: mutation.product.catalogRevision,
    legacyKey: mutation.product.legacyKey,
    snapshotPosKey: mutation.product.productSnapshot?.posKey,
    snapshotRevision: mutation.product.productSnapshot?.revision,
    snapshotProductType: mutation.product.productSnapshot?.productType,
    productName: mutation.product.name,
    quantity: mutation.product.quantity ?? 1,
    price: mutation.product.price,
  });
  console.log('[adisyon-flow] table-orders payload', {
    url: requestUrl,
    tableId: mutation.tableId,
    mutationId: mutation.mutationId,
    product: mutation.product,
  });

  const response = await runtimeFetch(POS_TABLE_ORDERS_API, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tableId: mutation.tableId,
      mutationId: mutation.mutationId,
      product: mutation.product,
    }),
  });
  const payload = await readJsonResponse(response) as {
    ordersByTable?: Record<string, TLine[]>;
    mutationId?: string;
    message?: string;
    error?: string;
    traceId?: string;
    code?: string;
    details?: Record<string, unknown>;
  };

  diagnostics?.('add-product-fetch-response', {
    requestUrl,
    mutationId: mutation.mutationId,
    tableId: mutation.tableId,
    status: response.status,
    ok: response.ok,
    responseMutationId: payload.mutationId,
    traceId: payload.traceId,
    tableCount: payload.ordersByTable ? Object.keys(payload.ordersByTable).length : 0,
    activeLineCount: payload.ordersByTable?.[mutation.tableId]?.length ?? 0,
    code: payload.code,
    details: payload.details,
    error: payload.error,
    message: payload.message,
  });

  if (!response.ok) {
    runtimeMutationRolledBackCount += 1;
    diagnostics?.('mutation rolled back', {
      tableId: mutation.tableId,
      mutationId: mutation.mutationId,
      runtimeMutationRolledBackCount,
      status: response.status,
      code: payload.code,
      traceId: payload.traceId,
    });
    throw new Error(`Authoritative product mutation failed with ${response.status}: ${payload.message ?? payload.error ?? payload.code ?? 'unknown error'}${payload.traceId ? ` (${payload.traceId})` : ''}`);
  }

  runtimeMutationCommittedCount += 1;
  diagnostics?.('mutation committed', {
    tableId: mutation.tableId,
    mutationId: payload.mutationId ?? mutation.mutationId,
    runtimeMutationCommittedCount,
    tableCount: payload.ordersByTable ? Object.keys(payload.ordersByTable).length : 0,
    activeLineCount: payload.ordersByTable?.[mutation.tableId]?.length ?? 0,
  });

  return {
    ordersByTable: payload.ordersByTable ?? {},
    mutationId: payload.mutationId ?? mutation.mutationId,
  } satisfies MutationResult<TLine>;
}

export function getOrderMutationRuntimeDiagnostics(pendingMutation?: PendingMutation | null) {
  const pendingAgeMs = pendingMutation ? Date.now() - pendingMutation.at : 0;
  return {
    runtimeMutationCreatedCount,
    runtimeMutationDispatchedCount,
    runtimeMutationCommittedCount,
    runtimeMutationRolledBackCount,
    pendingMutation: pendingMutation
      ? {
          tableId: pendingMutation.tableId,
          source: pendingMutation.source,
          ageMs: pendingAgeMs,
          stale: pendingAgeMs > MAX_PENDING_MUTATION_AGE_MS,
        }
      : null,
    maxPendingMutationAgeMs: MAX_PENDING_MUTATION_AGE_MS,
  };
}
