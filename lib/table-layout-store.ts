'use client';

import { persistRuntimeScope, readRuntimeItem, refreshRuntimeScope, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';
import { runtimeFetch } from '@/lib/runtime/runtime-api';
import { loadSessionState } from '@/lib/session-store';
import { shouldUseSeedBusinessData } from '@/lib/tenant-clean-start';

export type StoredFloorTableStatus = 'available' | 'occupied' | 'reserved';

export type StoredFloorTable = {
  id: string;
  branchId: string;
  name: string;
  group: string;
  status: StoredFloorTableStatus;
  guests: number;
  total: number;
  paymentRequested: boolean;
};

type TableLayoutState = {
  tables: StoredFloorTable[];
};

const STORAGE_KEY = 'adisyon-table-layout-state';
const LOCAL_STORAGE_KEY = 'adisyum-local-table-layout-state';
const EVENT_NAME = 'adisyon-table-layout-state:changed';

function buildBranchTables(branchId: string, groups: string[], countPerGroup: number) {
  return groups.flatMap((group, groupIndex) =>
    Array.from({ length: countPerGroup }, (_, index) => {
      const no = String((groupIndex * countPerGroup) + index + 1).padStart(2, '0');
      return {
        id: `${branchId.toUpperCase()}-${no}`,
        branchId,
        name: `${group} ${no}`,
        group,
        status: 'available' as const,
        guests: 0,
        total: 0,
        paymentRequested: false,
      };
    }),
  );
}

function buildDefaultTables() {
  return [
    ...buildBranchTables('mrk', ['Salon', 'Teras', 'Bahce', 'VIP', 'Bar'], 10),
    ...buildBranchTables('kdy', ['Salon', 'Bahce', 'Bar'], 4),
    ...buildBranchTables('izm', ['Salon', 'Teras', 'Bar'], 4),
  ];
}

const DEFAULT_TABLE_LAYOUT_STATE: TableLayoutState = {
  tables: buildDefaultTables(),
};

const EMPTY_TABLE_LAYOUT_STATE: TableLayoutState = {
  tables: [],
};

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function localTableLayoutKey() {
  const session = loadSessionState();
  return session.isAuthenticated && session.tenantId ? `${LOCAL_STORAGE_KEY}:${session.tenantId}` : null;
}

function readLocalTableLayoutState() {
  if (typeof window === 'undefined') return null;
  try {
    const key = localTableLayoutKey();
    return key ? window.localStorage.getItem(key) : null;
  } catch (error) {
    console.error('[business-flow] local table layout read failed', error);
    return null;
  }
}

function writeLocalTableLayoutState(value: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = localTableLayoutKey();
    if (!key) return;
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error('[business-flow] local table layout save failed', error);
  }
}

function normalizeTableLayoutState(input: unknown): TableLayoutState | null {
  if (!input || typeof input !== 'object') return null;
  const tables = (input as Partial<TableLayoutState>).tables;
  if (!Array.isArray(tables)) return null;
  return {
    tables: tables
      .filter((table): table is StoredFloorTable => Boolean(table) && typeof table === 'object' && typeof (table as StoredFloorTable).id === 'string')
      .map((table) => ({
        id: String(table.id),
        branchId: String(table.branchId || 'mrk'),
        name: String(table.name || table.id),
        group: String(table.group || 'Salon'),
        status: table.status === 'occupied' || table.status === 'reserved' ? table.status : 'available',
        guests: Number.isFinite(Number(table.guests)) ? Number(table.guests) : 0,
        total: Number.isFinite(Number(table.total)) ? Number(table.total) : 0,
        paymentRequested: Boolean(table.paymentRequested),
      })),
  };
}

function applyTableLayoutState(state: TableLayoutState, options: { persistRuntime?: boolean } = {}) {
  const serialized = JSON.stringify(state);
  writeLocalTableLayoutState(serialized);
  writeRuntimeItem('tenant', STORAGE_KEY, serialized, { persist: options.persistRuntime ?? false });
}

async function fetchServerTableLayoutState() {
  const response = await runtimeFetch('/api/runtime/table-state', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Table layout server fetch failed with ${response.status}`);
  const payload = await response.json().catch(() => null) as { state?: unknown } | null;
  return normalizeTableLayoutState(payload?.state);
}

async function persistServerTableLayoutState(state: TableLayoutState) {
  const response = await runtimeFetch('/api/runtime/table-state', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tables: state.tables }),
  });
  if (!response.ok) throw new Error(`Table layout server save failed with ${response.status}`);
}

export function getDefaultTableLayoutState(): TableLayoutState {
  return shouldUseSeedBusinessData() ? DEFAULT_TABLE_LAYOUT_STATE : EMPTY_TABLE_LAYOUT_STATE;
}

export function loadTableLayoutState() {
  if (typeof window === 'undefined') {
    return getDefaultTableLayoutState();
  }

  try {
    const runtimeRaw = readRuntimeItem('tenant', STORAGE_KEY);
    const raw = runtimeRaw ?? readLocalTableLayoutState();
    if (!raw) {
      return getDefaultTableLayoutState();
    }

    return normalizeTableLayoutState(JSON.parse(raw)) ?? getDefaultTableLayoutState();
  } catch (error) {
    console.error('[business-flow] table layout load failed', error);
    return getDefaultTableLayoutState();
  }
}

export function saveTableLayoutState(state: TableLayoutState) {
  if (typeof window === 'undefined') return;

  try {
    const serialized = JSON.stringify(state);
    writeLocalTableLayoutState(serialized);
    writeRuntimeItem('tenant', STORAGE_KEY, serialized);
    void persistServerTableLayoutState(state).catch((error) => {
      console.error('[business-flow] table layout authoritative sync failed', error);
    });
    void persistRuntimeScope('tenant').catch((error) => {
      console.error('[business-flow] table layout server sync failed', error);
    });
    emitChange();
  } catch (error) {
    console.error('[business-flow] table layout save failed', error);
  }
}

export async function refreshTableLayoutState() {
  if (typeof window === 'undefined') return getDefaultTableLayoutState();

  const serverState = await fetchServerTableLayoutState().catch((error) => {
    console.warn('[business-flow] table layout authoritative fetch failed', error);
    return null;
  });
  if (serverState) {
    applyTableLayoutState(serverState, { persistRuntime: false });
    emitChange();
    return serverState;
  }

  await refreshRuntimeScope('tenant');
  const state = loadTableLayoutState();
  emitChange();
  return state;
}

export function subscribeToTableLayoutChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = () => callback();
  const onStorage = (event: StorageEvent) => {
    const key = localTableLayoutKey();
    if (key && event.key === key) callback();
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
    unsubscribeRuntime();
  };
}
