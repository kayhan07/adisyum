'use client';

import { fetchAuthoritativeTablePayload } from '@/lib/pos-runtime/runtime-sync-engine';
import type { RuntimeOrderLine } from '@/lib/pos-runtime/order-mutations';
import { loadSessionState } from '@/lib/session-store';

export type AuthoritativeOrdersByTable<T = unknown> = Record<string, T[]>;
type OrdersListener = () => void;
export type AuthoritativeOrdersDiagnostics = {
  tenantId?: string;
  openOrderCount?: number;
  openItemCount?: number;
  visibleTableCount?: number;
  visibleLineCount?: number;
};

const listeners = new Set<OrdersListener>();
let snapshot: AuthoritativeOrdersByTable = {};
let diagnostics: AuthoritativeOrdersDiagnostics | null = null;
let inflight: Promise<AuthoritativeOrdersByTable> | null = null;
let activeTenantId = 'anonymous';

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeSnapshot<T>(ordersByTable: AuthoritativeOrdersByTable<T>) {
  return Object.fromEntries(
    Object.entries(ordersByTable).map(([tableId, lines]) => [tableId, Array.isArray(lines) ? lines : []]),
  ) as AuthoritativeOrdersByTable<T>;
}

function currentTenantId() {
  const session = loadSessionState();
  return session.isAuthenticated && session.tenantId ? session.tenantId : 'anonymous';
}

function ensureTenantIdentity() {
  const nextTenantId = currentTenantId();
  if (activeTenantId === nextTenantId) return nextTenantId;
  activeTenantId = nextTenantId;
  snapshot = {};
  diagnostics = null;
  inflight = null;
  emit();
  console.info('[authoritative-table-orders] tenant identity changed; snapshot cleared', {
    tenantId: nextTenantId,
  });
  return nextTenantId;
}

export function getAuthoritativeOrdersByTable<T>() {
  ensureTenantIdentity();
  return snapshot as AuthoritativeOrdersByTable<T>;
}

export function getAuthoritativeOrdersDiagnostics() {
  ensureTenantIdentity();
  return diagnostics;
}

export function replaceAuthoritativeOrdersByTable<T>(ordersByTable: AuthoritativeOrdersByTable<T>) {
  ensureTenantIdentity();
  snapshot = normalizeSnapshot(ordersByTable);
  emit();
  return snapshot as AuthoritativeOrdersByTable<T>;
}

export function subscribeToAuthoritativeOrders(callback: OrdersListener) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function refreshAuthoritativeOrdersByTable<T>() {
  const requestTenantId = ensureTenantIdentity();
  if (requestTenantId === 'anonymous') {
    return replaceAuthoritativeOrdersByTable({}) as AuthoritativeOrdersByTable<T>;
  }
  if (inflight) return inflight as Promise<AuthoritativeOrdersByTable<T>>;

  inflight = fetchAuthoritativeTablePayload<RuntimeOrderLine>()
    .then((payload) => {
      if (ensureTenantIdentity() !== requestTenantId) {
        console.warn('[authoritative-table-orders] stale tenant payload discarded', {
          requestTenantId,
          activeTenantId,
        });
        return snapshot as AuthoritativeOrdersByTable<T>;
      }
      diagnostics = payload.diagnostics ?? null;
      return replaceAuthoritativeOrdersByTable(payload.ordersByTable as AuthoritativeOrdersByTable<T>);
    })
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<AuthoritativeOrdersByTable<T>>;
}
