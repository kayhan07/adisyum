'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';
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

    const parsed = JSON.parse(raw) as Partial<TableLayoutState>;
    return {
      tables: Array.isArray(parsed.tables)
        ? parsed.tables
        : getDefaultTableLayoutState().tables,
    } satisfies TableLayoutState;
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
    emitChange();
  } catch (error) {
    console.error('[business-flow] table layout save failed', error);
  }
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
