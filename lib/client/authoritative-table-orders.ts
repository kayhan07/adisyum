'use client';

import { fetchAuthoritativeTablePayload } from '@/lib/pos-runtime/runtime-sync-engine';
import type { RuntimeOrderLine } from '@/lib/pos-runtime/order-mutations';

export type AuthoritativeOrdersByTable<T = unknown> = Record<string, T[]>;
type OrdersListener = () => void;

const listeners = new Set<OrdersListener>();
let snapshot: AuthoritativeOrdersByTable = {};
let inflight: Promise<AuthoritativeOrdersByTable> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeSnapshot<T>(ordersByTable: AuthoritativeOrdersByTable<T>) {
  return Object.fromEntries(
    Object.entries(ordersByTable).map(([tableId, lines]) => [tableId, Array.isArray(lines) ? lines : []]),
  ) as AuthoritativeOrdersByTable<T>;
}

export function getAuthoritativeOrdersByTable<T>() {
  return snapshot as AuthoritativeOrdersByTable<T>;
}

export function replaceAuthoritativeOrdersByTable<T>(ordersByTable: AuthoritativeOrdersByTable<T>) {
  snapshot = normalizeSnapshot(ordersByTable);
  emit();
  return snapshot as AuthoritativeOrdersByTable<T>;
}

export function subscribeToAuthoritativeOrders(callback: OrdersListener) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function refreshAuthoritativeOrdersByTable<T>() {
  if (inflight) return inflight as Promise<AuthoritativeOrdersByTable<T>>;

  inflight = fetchAuthoritativeTablePayload<RuntimeOrderLine>()
    .then((payload) => replaceAuthoritativeOrdersByTable(payload.ordersByTable as AuthoritativeOrdersByTable<T>))
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<AuthoritativeOrdersByTable<T>>;
}
