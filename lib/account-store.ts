'use client';

import type { Account } from '@/lib/erp-engine';

const STORAGE_KEY = 'adisyon-local-accounts';
const EVENT_NAME = 'adisyon-local-accounts:changed';

function emitChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function normalizeAccountKey(account: Pick<Account, 'id' | 'code' | 'name'>) {
  return `${account.id}|${account.code.trim().toLocaleLowerCase('tr-TR')}|${account.name.trim().toLocaleLowerCase('tr-TR')}`;
}

function normalizeStoredAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((account): account is Account => {
    return Boolean(
      account
      && typeof account === 'object'
      && 'id' in account
      && 'code' in account
      && 'name' in account
      && 'type' in account,
    );
  });
}

export function loadStoredAccounts() {
  if (typeof window === 'undefined') {
    return [] as Account[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeStoredAccounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStoredAccounts(accounts: Account[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const existing = loadStoredAccounts();
    const seen = new Set<string>();
    const merged = [...accounts, ...existing].filter((account) => {
      const key = normalizeAccountKey(account);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    emitChange();
  } catch {
    // ignore storage errors in demo env
  }
}

export function appendStoredAccount(account: Account) {
  const current = loadStoredAccounts();
  saveStoredAccounts([account, ...current]);
}

export function subscribeToStoredAccountChanges(callback: () => void) {
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
