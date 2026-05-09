'use client';

import {
  getPaymentRequestedTableIds,
  getStoredOrdersByTable,
  getStoredTableMeta,
  getTableLiveTotals,
  setStoredOrdersByTable,
  setStoredTableMeta,
  setTableLiveTotals,
} from '@/lib/table-payment-state';
import {
  buildPosCatalogFromStored,
  getDefaultPosCatalog,
  loadStoredSaleProducts,
  type PosCatalogProduct,
} from '@/lib/sale-product-catalog';

const WAITER_CALLS_STORAGE_KEY = 'aurelia-qr-waiter-calls';
const PENDING_QR_ORDERS_STORAGE_KEY = 'aurelia-qr-pending-orders';
const QR_EVENT_NAME = 'aurelia-qr-menu:changed';
const VAT_RATE = 0.1;

export type QrOrderLine = {
  id: string;
  name: string;
  qty: number;
  note: string;
  price: number;
  category: string;
  sentQty: number;
};

export type QrCartItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  qty: number;
};

export type PendingQrOrder = {
  id: string;
  tableId: string;
  createdAt: string;
  items: QrCartItem[];
};

function emitQrChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(QR_EVENT_NAME));
}

export function getAppOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

export function buildTableQrUrl(tableId: string, origin = getAppOrigin()) {
  return `${origin}/qr/${encodeURIComponent(tableId)}`;
}

export function getQrCodeImageUrl(url: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

export function getWaiterCallTableIds() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>;
  }

  const raw = window.localStorage.getItem(WAITER_CALLS_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

export function getPendingQrOrders() {
  if (typeof window === 'undefined') {
    return [] as PendingQrOrder[];
  }

  const raw = window.localStorage.getItem(PENDING_QR_ORDERS_STORAGE_KEY);
  if (!raw) {
    return [] as PendingQrOrder[];
  }

  try {
    const parsed = JSON.parse(raw) as PendingQrOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as PendingQrOrder[];
  }
}

function setPendingQrOrders(orders: PendingQrOrder[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PENDING_QR_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  emitQrChange();
}

export function setTableWaiterRequested(tableId: string, requested: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = { ...getWaiterCallTableIds() };

  if (requested) {
    current[tableId] = new Date().toISOString();
  } else {
    delete current[tableId];
  }

  window.localStorage.setItem(WAITER_CALLS_STORAGE_KEY, JSON.stringify(current));
  emitQrChange();
}

export function subscribeToQrMenuChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === WAITER_CALLS_STORAGE_KEY || event.key === PENDING_QR_ORDERS_STORAGE_KEY) {
      callback();
    }
  };

  const handleCustom = () => {
    callback();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(QR_EVENT_NAME, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(QR_EVENT_NAME, handleCustom);
  };
}

export function getPosCatalogSnapshot() {
  const stored = loadStoredSaleProducts();
  return stored?.length ? buildPosCatalogFromStored(stored) : getDefaultPosCatalog();
}

export function getTableQrStatus(tableId: string) {
  const waiterCalls = getWaiterCallTableIds();
  const billRequests = new Set(getPaymentRequestedTableIds());
  const totals = getTableLiveTotals();
  const meta = getStoredTableMeta();
  const pendingOrders = getPendingQrOrders().filter((order) => order.tableId === tableId);

  return {
    waiterRequestedAt: waiterCalls[tableId] ?? null,
    billRequested: billRequests.has(tableId),
    total: totals[tableId] ?? 0,
    meta: meta[tableId] ?? {},
    pendingOrders,
  };
}

export function queueQrOrderForApproval(tableId: string, items: QrCartItem[]) {
  if (typeof window === 'undefined' || items.length === 0) {
    return;
  }

  const current = getPendingQrOrders();
  setPendingQrOrders([
    ...current,
    {
      id: `pending-${tableId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tableId,
      createdAt: new Date().toISOString(),
      items,
    },
  ]);
}

export function approvePendingQrOrder(orderId: string) {
  const current = getPendingQrOrders();
  const target = current.find((order) => order.id === orderId);
  if (!target) {
    return;
  }

  appendQrOrderToTable(target.tableId, target.items);
  setPendingQrOrders(current.filter((order) => order.id !== orderId));
}

export function rejectPendingQrOrder(orderId: string) {
  const current = getPendingQrOrders();
  setPendingQrOrders(current.filter((order) => order.id !== orderId));
}

export function appendQrOrderToTable(tableId: string, items: QrCartItem[]) {
  if (typeof window === 'undefined' || items.length === 0) {
    return;
  }

  const orders = getStoredOrdersByTable<QrOrderLine>();
  const currentLines = [...(orders[tableId] ?? [])];

  items.forEach((item) => {
    const existingIndex = currentLines.findIndex(
      (line) => line.name === item.name && line.price === item.price && line.note === '',
    );

    if (existingIndex >= 0) {
      const current = currentLines[existingIndex];
      currentLines[existingIndex] = {
        ...current,
        qty: current.qty + item.qty,
      };
      return;
    }

    currentLines.push({
      id: `qr-${tableId}-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      qty: item.qty,
      note: '',
      price: item.price,
      category: item.category,
      sentQty: 0,
    });
  });

  const nextOrders = {
    ...orders,
    [tableId]: currentLines,
  };

  setStoredOrdersByTable(nextOrders);

  const existingTotals = getTableLiveTotals();
  const totalIds = [...new Set([...Object.keys(existingTotals), ...Object.keys(nextOrders)])];
  const nextTotals = Object.fromEntries(
    totalIds.map((id) => {
      const lines = nextOrders[id] ?? [];
      const subtotal = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
      const grossTotal = Number((subtotal * (1 + VAT_RATE)).toFixed(2));
      return [id, grossTotal];
    }),
  ) as Record<string, number>;
  setTableLiveTotals(nextTotals);

  const meta = getStoredTableMeta();
  const previous = meta[tableId] ?? {};
  const now = new Date().toISOString();
  setStoredTableMeta({
    ...meta,
    [tableId]: {
      ...previous,
      openedAt: previous.openedAt ?? now,
      lastActionAt: now,
      guests: Math.max(1, previous.guests ?? 0),
    },
  });
}

export function formatQrCategoryLabel(category: string) {
  switch (category) {
    case 'kahve':
      return 'Kahve';
    case 'icecek':
      return 'İçecek';
    case 'tatli':
      return 'Tatlı';
    case 'mutfak':
      return 'Mutfak';
    default:
      return 'Menü';
  }
}

export function getCategoryAccent(category: string) {
  switch (category) {
    case 'kahve':
      return 'from-amber-500/85 via-orange-400/75 to-yellow-300/80';
    case 'icecek':
      return 'from-sky-500/85 via-cyan-400/75 to-teal-300/80';
    case 'tatli':
      return 'from-fuchsia-500/85 via-pink-400/75 to-rose-300/80';
    default:
      return 'from-blue-500/85 via-indigo-400/75 to-violet-300/80';
  }
}
