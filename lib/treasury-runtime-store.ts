'use client';

import type { TreasuryMovement } from '@/lib/erp-engine';

const STORAGE_KEY = 'adisyon-treasury-runtime-movements';
const EVENT_NAME = 'adisyon-treasury-runtime:changed';

function emitChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function loadStoredTreasuryMovements() {
  if (typeof window === 'undefined') {
    return [] as TreasuryMovement[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TreasuryMovement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredTreasuryMovements(movements: TreasuryMovement[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const merged = uniqueById([...movements, ...loadStoredTreasuryMovements()]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    emitChange();
  } catch {
    // ignore storage errors in demo env
  }
}

export function appendStoredTreasuryMovements(movements: TreasuryMovement[]) {
  saveStoredTreasuryMovements(movements);
}

export function removeStoredTreasuryMovementIds(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) {
    return;
  }

  const blockedIds = new Set(ids);
  const next = loadStoredTreasuryMovements().filter((movement) => !blockedIds.has(movement.id));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

export function subscribeToStoredTreasuryChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  const onCustom = () => callback();

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
