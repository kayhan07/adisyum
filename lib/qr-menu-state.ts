'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

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

const PENDING_QR_ORDERS_STORAGE_KEY = 'aurelia-qr-pending-orders';
const QR_EVENT_NAME = 'aurelia-qr-menu:changed';

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

  return process.env.NEXT_PUBLIC_APP_URL ?? '';
}

export function buildTableQrUrl(tableId: string, origin = getAppOrigin()) {
  return `${origin}/qr/${encodeURIComponent(tableId)}`;
}

export function getQrCodeImageUrl(url: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

export function getPendingQrOrders() {
  if (typeof window === 'undefined') {
    return [] as PendingQrOrder[];
  }

  const raw = readRuntimeItem('tenant', PENDING_QR_ORDERS_STORAGE_KEY);
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

  writeRuntimeItem('tenant', PENDING_QR_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  emitQrChange();
}

export function subscribeToQrMenuChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustom = () => {
    callback();
  };

  window.addEventListener(QR_EVENT_NAME, handleCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(QR_EVENT_NAME, handleCustom);
    unsubscribeRuntime();
  };
}

export function getPosCatalogSnapshot() {
  const stored = loadStoredSaleProducts();
  return stored?.length ? buildPosCatalogFromStored(stored) : getDefaultPosCatalog();
}

export function getTableQrStatus(tableId: string) {
  const billRequests = new Set(getPaymentRequestedTableIds());
  const totals = getTableLiveTotals();
  const meta = getStoredTableMeta();
  const pendingOrders = getPendingQrOrders().filter((order) => order.tableId === tableId);

  return {
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
      const grossTotal = Number(subtotal.toFixed(2));
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
