'use client';

import type { TreasuryMovement } from '@/lib/erp-engine';
import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

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
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TreasuryMovement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[business-flow] treasury movements load failed', error);
    return [];
  }
}

export function saveStoredTreasuryMovements(movements: TreasuryMovement[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const merged = uniqueById([...movements, ...loadStoredTreasuryMovements()]);
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(merged));
    emitChange();
  } catch (error) {
    console.error('[business-flow] treasury movements save failed', error);
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
  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

export function subscribeToStoredTreasuryChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onCustom = () => callback();

  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}
