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
let activeIdentity = 'anonymous:global';

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeSnapshot<T>(ordersByTable: AuthoritativeOrdersByTable<T>) {
  const tenantId = currentTenantId();
  const branchId = currentBranchId();
  return Object.fromEntries(
    Object.entries(ordersByTable).map(([tableId, lines]) => [
      tableId,
      Array.isArray(lines)
        ? lines.filter((line) => {
            if (!line || typeof line !== 'object') return true;
            const record = line as Record<string, unknown>;
            const lineTenantId = typeof record.tenantId === 'string' ? record.tenantId : null;
            const lineBranchId = typeof record.branchId === 'string' ? record.branchId : null;
            return (!lineTenantId || lineTenantId === tenantId) && (!lineBranchId || lineBranchId === branchId);
          })
        : [],
    ]),
  ) as AuthoritativeOrdersByTable<T>;
}

function currentTenantId() {
  const session = loadSessionState();
  return session.isAuthenticated && session.tenantId ? session.tenantId : 'anonymous';
}

function currentBranchId() {
  const session = loadSessionState();
  return session.isAuthenticated
    ? (session.activeBranchId || session.currentUser.branchId || 'global')
    : 'global';
}

function currentIdentity() {
  return `${currentTenantId()}:${currentBranchId()}`;
}

function ensureTenantIdentity() {
  const nextIdentity = currentIdentity();
  if (activeIdentity === nextIdentity) return nextIdentity;
  activeIdentity = nextIdentity;
  snapshot = {};
  diagnostics = null;
  inflight = null;
  emit();
  console.info('[authoritative-table-orders] tenant identity changed; snapshot cleared', {
    identity: nextIdentity,
    tenantId: currentTenantId(),
    branchId: currentBranchId(),
  });
  return nextIdentity;
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
  const requestIdentity = ensureTenantIdentity();
  const requestTenantId = currentTenantId();
  const requestBranchId = currentBranchId();
  if (requestTenantId === 'anonymous') {
    return replaceAuthoritativeOrdersByTable({}) as AuthoritativeOrdersByTable<T>;
  }
  if (inflight) return inflight as Promise<AuthoritativeOrdersByTable<T>>;

  inflight = fetchAuthoritativeTablePayload<RuntimeOrderLine>()
    .then((payload) => {
      if (ensureTenantIdentity() !== requestIdentity) {
        console.warn('[authoritative-table-orders] stale tenant payload discarded', {
          requestIdentity,
          activeIdentity,
          requestTenantId,
        });
        return snapshot as AuthoritativeOrdersByTable<T>;
      }
      if (
        (payload.tenantId && payload.tenantId !== requestTenantId)
        || (payload.branchId && payload.branchId !== requestBranchId)
      ) {
        console.error('[authoritative-table-orders] foreign tenant payload discarded', {
          requestTenantId,
          requestBranchId,
          payloadTenantId: payload.tenantId,
          payloadBranchId: payload.branchId,
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
