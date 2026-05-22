'use client';

import { POS_TABLE_ORDERS_API, runtimeFetch } from '@/lib/runtime/runtime-api';

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

  inflight = runtimeFetch(POS_TABLE_ORDERS_API, {
    method: 'GET',
    cache: 'no-store',
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null) as { ordersByTable?: AuthoritativeOrdersByTable<T>; message?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(`Authoritative order fetch failed with ${response.status}: ${payload?.message ?? payload?.error ?? 'unknown error'}`);
      }
      return replaceAuthoritativeOrdersByTable(payload?.ordersByTable ?? {});
    })
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<AuthoritativeOrdersByTable<T>>;
}
