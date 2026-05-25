'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

const STORAGE_KEY = 'adisyon-table-reservations';
const EVENT_NAME = 'adisyon-table-reservations:changed';

export type StoredTableReservationStatus = 'arrived' | 'no_show' | 'waiting';

export type StoredTableReservation = {
  id: string;
  tableId: string;
  guestName: string;
  phone?: string;
  date: string;
  time?: string;
  event?: string;
  deposit?: number;
  depositMethod?: 'cash' | 'bank' | 'pos' | 'account';
  depositAccountId?: string;
  guestCount: number;
  status: StoredTableReservationStatus;
  createdAt: string;
  updatedAt: string;
};

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

export function loadStoredTableReservations() {
  if (typeof window === 'undefined') {
    return [] as StoredTableReservation[];
  }

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredTableReservation[];
    return Array.isArray(parsed) ? uniqueById(parsed) : [];
  } catch (error) {
    console.error('[business-flow] table reservations load failed', error);
    return [];
  }
}

export function saveStoredTableReservations(reservations: StoredTableReservation[]) {
  if (typeof window === 'undefined') {
    return;
  }

  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(uniqueById(reservations)));
  emitChange();
}

export function upsertStoredTableReservation(reservation: StoredTableReservation) {
  const current = loadStoredTableReservations();
  saveStoredTableReservations([reservation, ...current.filter((item) => item.id !== reservation.id)]);
}

export function removeStoredTableReservation(reservationId: string) {
  const current = loadStoredTableReservations();
  saveStoredTableReservations(current.filter((item) => item.id !== reservationId));
}

export function subscribeToStoredTableReservations(callback: () => void) {
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

export function buildStoredTableReservation(params: {
  id?: string;
  tableId: string;
  guestName: string;
  phone?: string;
  date: string;
  time?: string;
  event?: string;
  deposit?: number;
  depositMethod?: 'cash' | 'bank' | 'pos' | 'account';
  depositAccountId?: string;
  guestCount: number;
  status: StoredTableReservationStatus;
}) {
  const now = new Date().toISOString();

  return {
    id: params.id ?? `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tableId: params.tableId,
    guestName: params.guestName,
    phone: params.phone,
    date: params.date,
    time: params.time,
    event: params.event,
    deposit: params.deposit,
    depositMethod: params.depositMethod,
    depositAccountId: params.depositAccountId,
    guestCount: params.guestCount,
    status: params.status,
    createdAt: now,
    updatedAt: now,
  } satisfies StoredTableReservation;
}
