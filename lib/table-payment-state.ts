const STORAGE_KEY = 'aurelia-table-payment-requested';
const TOTALS_STORAGE_KEY = 'aurelia-table-live-totals';
const ORDERS_STORAGE_KEY = 'aurelia-orders-by-table';
const META_STORAGE_KEY = 'aurelia-table-meta';
const EVENT_NAME = 'aurelia-table-payment-requested:changed';

function emitChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getPaymentRequestedTableIds() {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function setTablePaymentRequested(tableId: string, requested: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = new Set(getPaymentRequestedTableIds());

  if (requested) {
    current.add(tableId);
  } else {
    current.delete(tableId);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
  emitChange();
}

export function subscribeToPaymentRequestedChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  const handleCustom = () => {
    callback();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(EVENT_NAME, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(EVENT_NAME, handleCustom);
  };
}

export function getTableLiveTotals() {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>;
  }

  const raw = window.localStorage.getItem(TOTALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return {};
  }
}

export function setTableLiveTotals(totals: Record<string, number>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOTALS_STORAGE_KEY, JSON.stringify({ ...getTableLiveTotals(), ...totals }));
  emitChange();
}

export function getStoredOrdersByTable<T>() {
  if (typeof window === 'undefined') {
    return {} as Record<string, T[]>;
  }

  const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, T[]>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, T[]] => Array.isArray(entry[1])),
    );
  } catch {
    return {} as Record<string, T[]>;
  }
}

export function setStoredOrdersByTable<T>(orders: Record<string, T[]>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    ORDERS_STORAGE_KEY,
    JSON.stringify({ ...getStoredOrdersByTable<T>(), ...orders }),
  );
  emitChange();
}

export function subscribeToStoredOrdersChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ORDERS_STORAGE_KEY) {
      callback();
    }
  };

  const handleCustom = () => {
    callback();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(EVENT_NAME, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(EVENT_NAME, handleCustom);
  };
}

export type StoredTableMeta = {
  guests?: number;
  reservationName?: string;
  reservationPhone?: string;
  reservationStatus?: 'arrived' | 'no_show' | 'waiting';
  reservationTime?: string;
  reservationDate?: string;
  reservationEvent?: string;
  reservationDeposit?: number;
  note?: string;
  openedAt?: string;
  lastActionAt?: string;
  mergedFromIds?: string[];
  mergedSnapshot?: {
    sourceOrders: Record<string, unknown[]>;
    sourceMeta: Record<string, StoredTableMeta>;
  };
};

export function getStoredTableMeta() {
  if (typeof window === 'undefined') {
    return {} as Record<string, StoredTableMeta>;
  }

  const raw = window.localStorage.getItem(META_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, StoredTableMeta>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, StoredTableMeta>;
    return parsed ?? {};
  } catch {
    return {} as Record<string, StoredTableMeta>;
  }
}

export function setStoredTableMeta(meta: Record<string, StoredTableMeta>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify({ ...getStoredTableMeta(), ...meta }));
  emitChange();
}
