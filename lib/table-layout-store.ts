'use client';

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

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getDefaultTableLayoutState(): TableLayoutState {
  return {
    tables: buildDefaultTables(),
  };
}

export function loadTableLayoutState() {
  if (typeof window === 'undefined') {
    return getDefaultTableLayoutState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultTableLayoutState();
    }

    const parsed = JSON.parse(raw) as Partial<TableLayoutState>;
    return {
      tables: Array.isArray(parsed.tables)
        ? parsed.tables
        : getDefaultTableLayoutState().tables,
    } satisfies TableLayoutState;
  } catch {
    return getDefaultTableLayoutState();
  }
}

export function saveTableLayoutState(state: TableLayoutState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emitChange();
  } catch {
    // ignore storage errors
  }
}

export function subscribeToTableLayoutChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
