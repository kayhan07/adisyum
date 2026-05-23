'use client';

import type { AccountTransaction, AccountTransactionType } from '@/lib/erp-engine';
import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

const FINANCE_INVOICES_KEY = 'adisyon-finance-invoices';
const FINANCE_ACCOUNT_TX_KEY = 'adisyon-finance-account-transactions';
const EVENT_NAME = 'adisyon-finance-runtime:changed';

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

export type StoredFinanceInvoice = {
  id: string;
  mode: 'purchase' | 'sales';
  invoiceNo: string;
  date: string;
  dueDate: string;
  partnerId: string;
  partnerName: string;
  paymentType: 'cash' | 'card' | 'bank' | 'account';
  total: number;
  createdAt: string;
};

export type StoredFinanceAccountTransaction = AccountTransaction;

function emitChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadStoredFinanceInvoices() {
  if (typeof window === 'undefined') {
    return [] as StoredFinanceInvoice[];
  }

  try {
    const raw = readRuntimeItem('tenant', FINANCE_INVOICES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredFinanceInvoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[business-flow] finance invoices load failed', error);
    return [];
  }
}

export function saveStoredFinanceInvoices(invoices: StoredFinanceInvoice[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    writeRuntimeItem(
      'tenant',
      FINANCE_INVOICES_KEY,
      JSON.stringify(uniqueById([...invoices, ...loadStoredFinanceInvoices()])),
    );
    console.log('[business-flow] finance invoices saved', { invoiceCount: invoices.length });
    emitChange();
  } catch (error) {
    console.error('[business-flow] finance invoices save failed', error);
  }
}

export function appendStoredFinanceInvoice(invoice: StoredFinanceInvoice) {
  const current = loadStoredFinanceInvoices();
  saveStoredFinanceInvoices([invoice, ...current]);
}

export function loadStoredFinanceAccountTransactions() {
  if (typeof window === 'undefined') {
    return [] as StoredFinanceAccountTransaction[];
  }

  try {
    const raw = readRuntimeItem('tenant', FINANCE_ACCOUNT_TX_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredFinanceAccountTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[business-flow] finance account transactions load failed', error);
    return [];
  }
}

export function saveStoredFinanceAccountTransactions(transactions: StoredFinanceAccountTransaction[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    writeRuntimeItem(
      'tenant',
      FINANCE_ACCOUNT_TX_KEY,
      JSON.stringify(uniqueById([...transactions, ...loadStoredFinanceAccountTransactions()])),
    );
    console.log('[business-flow] finance account transactions saved', { transactionCount: transactions.length });
    emitChange();
  } catch (error) {
    console.error('[business-flow] finance account transactions save failed', error);
  }
}

export function appendStoredFinanceAccountTransaction(transaction: StoredFinanceAccountTransaction) {
  const current = loadStoredFinanceAccountTransactions();
  saveStoredFinanceAccountTransactions([transaction, ...current]);
}

export function removeStoredFinanceAccountTransactionIds(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) {
    return;
  }

  const blockedIds = new Set(ids);
  const next = loadStoredFinanceAccountTransactions().filter((transaction) => !blockedIds.has(transaction.id));
  writeRuntimeItem('tenant', FINANCE_ACCOUNT_TX_KEY, JSON.stringify(next));
  emitChange();
}

export function subscribeToFinanceRuntimeChanges(callback: () => void) {
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

export function buildFinanceTransaction(params: {
  accountId: string;
  type: AccountTransactionType;
  amount: number;
  description: string;
  date: string;
}) {
  return {
    id: `runtime-${params.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    accountId: params.accountId,
    type: params.type,
    amount: params.amount,
    description: params.description,
    date: params.date,
  } satisfies StoredFinanceAccountTransaction;
}
