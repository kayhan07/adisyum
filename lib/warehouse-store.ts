// ─── Warehouse Store ────────────────────────────────────────────────────────
// Manages warehouses (ana depo + departmanlar), their stock levels, and
// transfer history between warehouses.

import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';

export type RawUnit = 'kg' | 'lt' | 'adet';

export type WarehouseType = 'main' | 'department';

export type Warehouse = {
  id: string;
  name: string;
  type: WarehouseType;
  description?: string;
  createdAt: string;
};

export type WarehouseStockLine = {
  ingredientId: string;
  ingredientName: string;
  unit: RawUnit;
  quantity: number;
};

/** Full stock snapshot for a warehouse */
export type WarehouseStock = {
  warehouseId: string;
  items: WarehouseStockLine[];
};

export type TransferRecord = {
  id: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  ingredientId: string;
  ingredientName: string;
  unit: RawUnit;
  quantity: number;
  deliveredBy?: string;
  receivedBy?: string;
  note?: string;
  transferredAt: string;
};

// ─── Storage keys ──────────────────────────────────────────────────────────

const WAREHOUSES_KEY = 'adisyon-warehouses';
const WAREHOUSE_STOCKS_KEY = 'adisyon-warehouse-stocks';
const WAREHOUSE_TRANSFERS_KEY = 'adisyon-warehouse-transfers';

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ─── Built-in main warehouse ───────────────────────────────────────────────

export const MAIN_WAREHOUSE_ID = 'ana-depo';

export const MAIN_WAREHOUSE: Warehouse = {
  id: MAIN_WAREHOUSE_ID,
  name: 'Ana Depo',
  type: 'main',
  description: 'Merkez depo — tüm girişler buraya yapılır',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ─── Warehouse CRUD ────────────────────────────────────────────────────────

export function loadWarehouses(): Warehouse[] {
  if (typeof window === 'undefined') return [MAIN_WAREHOUSE];

  try {
    const raw = readRuntimeItem('tenant', WAREHOUSES_KEY);
    if (!raw) return [MAIN_WAREHOUSE];
    const parsed = JSON.parse(raw) as Warehouse[];
    if (!Array.isArray(parsed)) return [MAIN_WAREHOUSE];
    // Ensure main warehouse is always first
    const hasMain = parsed.some((w) => w.id === MAIN_WAREHOUSE_ID);
    return hasMain ? parsed : [MAIN_WAREHOUSE, ...parsed];
  } catch (error) {
    console.error('[business-flow] warehouses load failed', error);
    return [MAIN_WAREHOUSE];
  }
}

export function saveWarehouses(warehouses: Warehouse[]): void {
  if (typeof window === 'undefined') return;

  try {
    const merged = uniqueByKey(
      [MAIN_WAREHOUSE, ...warehouses],
      (warehouse) => warehouse.id,
    );
    writeRuntimeItem('tenant', WAREHOUSES_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('[business-flow] warehouses save failed', error);
  }
}

// ─── Warehouse Stock ───────────────────────────────────────────────────────

export function loadAllWarehouseStocks(): Record<string, WarehouseStockLine[]> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = readRuntimeItem('tenant', WAREHOUSE_STOCKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, WarehouseStockLine[]>;
  } catch (error) {
    console.error('[business-flow] warehouse stocks load failed', error);
    return {};
  }
}

export function saveAllWarehouseStocks(stocks: Record<string, WarehouseStockLine[]>): void {
  if (typeof window === 'undefined') return;

  try {
    writeRuntimeItem('tenant', WAREHOUSE_STOCKS_KEY, JSON.stringify(stocks));
  } catch (error) {
    console.error('[business-flow] warehouse stocks save failed', error);
  }
}

export function getWarehouseStock(
  allStocks: Record<string, WarehouseStockLine[]>,
  warehouseId: string,
): WarehouseStockLine[] {
  return allStocks[warehouseId] ?? [];
}

export function setWarehouseStock(
  allStocks: Record<string, WarehouseStockLine[]>,
  warehouseId: string,
  items: WarehouseStockLine[],
): Record<string, WarehouseStockLine[]> {
  return { ...allStocks, [warehouseId]: items };
}

// ─── Transfer Records ──────────────────────────────────────────────────────

export function loadTransferRecords(): TransferRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readRuntimeItem('tenant', WAREHOUSE_TRANSFERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TransferRecord[]) : [];
  } catch (error) {
    console.error('[business-flow] warehouse transfers load failed', error);
    return [];
  }
}

export function saveTransferRecords(records: TransferRecord[]): void {
  if (typeof window === 'undefined') return;

  try {
    const merged = uniqueByKey(
      [...records, ...loadTransferRecords()],
      (record) => record.id,
    );
    writeRuntimeItem('tenant', WAREHOUSE_TRANSFERS_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('[business-flow] warehouse transfers save failed', error);
  }
}

// ─── Transfer Logic ────────────────────────────────────────────────────────

export type TransferResult =
  | { ok: true; updatedStocks: Record<string, WarehouseStockLine[]>; record: TransferRecord }
  | { ok: false; error: string };

export function executeTransfer(params: {
  allStocks: Record<string, WarehouseStockLine[]>;
  warehouses: Warehouse[];
  fromWarehouseId: string;
  toWarehouseId: string;
  ingredientId: string;
  ingredientName: string;
  unit: RawUnit;
  quantity: number;
  deliveredBy?: string;
  receivedBy?: string;
  note?: string;
}): TransferResult {
  const { allStocks, warehouses, fromWarehouseId, toWarehouseId, ingredientId, ingredientName, unit, quantity, deliveredBy, receivedBy, note } = params;

  if (fromWarehouseId === toWarehouseId) {
    return { ok: false, error: 'Kaynak ve hedef depo aynı olamaz.' };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Geçerli bir miktar giriniz.' };
  }

  const fromWarehouse = warehouses.find((w) => w.id === fromWarehouseId);
  const toWarehouse = warehouses.find((w) => w.id === toWarehouseId);
  if (!fromWarehouse || !toWarehouse) {
    return { ok: false, error: 'Depo bulunamadı.' };
  }

  const fromItems = [...(allStocks[fromWarehouseId] ?? [])];
  const fromLineIdx = fromItems.findIndex((l) => l.ingredientId === ingredientId);

  if (fromLineIdx === -1) {
    return { ok: false, error: 'Kaynak depoda bu ürün bulunamadı.' };
  }

  const fromLine = fromItems[fromLineIdx];
  if (fromLine.quantity < quantity) {
    return {
      ok: false,
      error: `Yetersiz stok. Mevcut: ${fromLine.quantity.toLocaleString('tr-TR')} ${unit}`,
    };
  }

  // Deduct from source
  const newFromQty = fromLine.quantity - quantity;
  if (newFromQty <= 0) {
    fromItems.splice(fromLineIdx, 1);
  } else {
    fromItems[fromLineIdx] = { ...fromLine, quantity: newFromQty };
  }

  // Add to destination
  const toItems = [...(allStocks[toWarehouseId] ?? [])];
  const toLineIdx = toItems.findIndex((l) => l.ingredientId === ingredientId);
  if (toLineIdx === -1) {
    toItems.push({ ingredientId, ingredientName, unit, quantity });
  } else {
    toItems[toLineIdx] = { ...toItems[toLineIdx], quantity: toItems[toLineIdx].quantity + quantity };
  }

  const updatedStocks: Record<string, WarehouseStockLine[]> = {
    ...allStocks,
    [fromWarehouseId]: fromItems,
    [toWarehouseId]: toItems,
  };

  const record: TransferRecord = {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromWarehouseId,
    fromWarehouseName: fromWarehouse.name,
    toWarehouseId,
    toWarehouseName: toWarehouse.name,
    ingredientId,
    ingredientName,
    unit,
    quantity,
    deliveredBy: deliveredBy?.trim() || undefined,
    receivedBy: receivedBy?.trim() || undefined,
    note: note?.trim() || undefined,
    transferredAt: new Date().toISOString(),
  };

  return { ok: true, updatedStocks, record };
}
