'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

const STORAGE_KEY = 'adisyon-payment-journal';
const EVENT_NAME = 'adisyon-payment-journal:changed';

export type PaymentJournalMethod = 'cash' | 'card' | 'account' | 'meal' | 'euro' | 'dollar';

export type PaymentJournalEntry = {
  id: string;
  date: string;
  amount: number;
  method: PaymentJournalMethod;
  source: 'table' | 'delivery';
  sourceId: string;
  label: string;
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

export function loadPaymentJournal() {
  if (typeof window === 'undefined') {
    return [] as PaymentJournalEntry[];
  }

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaymentJournalEntry[];
    return Array.isArray(parsed) ? uniqueById(parsed) : [];
  } catch (error) {
    console.error('[business-flow] payment journal load failed', error);
    return [];
  }
}

export function savePaymentJournal(entries: PaymentJournalEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(uniqueById(entries)));
    console.log('[business-flow] payment journal saved', { entryCount: entries.length });
    emitChange();
  } catch (error) {
    console.error('[business-flow] payment journal save failed', error);
  }
}

export function appendPaymentJournalEntries(entries: PaymentJournalEntry[]) {
  const current = loadPaymentJournal();
  savePaymentJournal([...entries, ...current]);
}

export function subscribeToPaymentJournalChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = () => callback();

  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}

export function buildPaymentJournalEntry(params: Omit<PaymentJournalEntry, 'id' | 'createdAt'>) {
  return {
    ...params,
    id: `payment-journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  } satisfies PaymentJournalEntry;
}
