'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

const STORAGE_KEY = 'adisyon-daily-cash-movements';
const EVENT_NAME = 'adisyon-daily-cash-movements:changed';

export type StoredDailyCashMovement = {
  id: string;
  date: string;
  type: 'advance' | 'expense' | 'day_end' | 'account_collection' | 'account_payment';
  amount: number;
  note: string;
  method?: 'cash' | 'card' | 'bank';
  accountId?: string;
  createdAt: string;
};

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function loadDailyCashMovements() {
  if (typeof window === 'undefined') {
    return [] as StoredDailyCashMovement[];
  }

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredDailyCashMovement[];
    return Array.isArray(parsed) ? uniqueById(parsed) : [];
  } catch {
    return [];
  }
}

export function saveDailyCashMovements(movements: StoredDailyCashMovement[]) {
  if (typeof window === 'undefined') return;
  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(uniqueById(movements)));
  emitChange();
}

export function appendDailyCashMovement(movement: StoredDailyCashMovement) {
  const current = loadDailyCashMovements();
  saveDailyCashMovements([movement, ...current]);
}

export function subscribeToDailyCashMovementChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = () => callback();

  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}
