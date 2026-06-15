'use client';

import type { AccountTransaction, AccountTransactionType } from '@/lib/erp-engine';
import type { Account } from '@/lib/erp-engine';
import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';
import { runtimeFetch } from '@/lib/runtime/runtime-api';
import { saveStoredAccounts } from '@/lib/account-store';

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
export type AuthoritativeCurrentAccountMovement = {
  id: string;
  accountId: string;
  reconciliationKey: string;
  type: 'SALE_DEBT' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
  method: string;
  debit: number | string;
  credit: number | string;
  balanceAfter?: number | string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

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

export function replaceStoredFinanceAccountTransactions(transactions: StoredFinanceAccountTransaction[]) {
  if (typeof window === 'undefined') return;
  writeRuntimeItem('tenant', FINANCE_ACCOUNT_TX_KEY, JSON.stringify(uniqueById(transactions)));
  emitChange();
}

function mapAuthoritativeMovement(movement: AuthoritativeCurrentAccountMovement): StoredFinanceAccountTransaction {
  const debit = Number(movement.debit ?? 0);
  const credit = Number(movement.credit ?? 0);
  const accountType = typeof movement.metadata?.accountType === 'string' ? movement.metadata.accountType : 'customer';
  const type = debit > credit
    ? accountType === 'supplier'
      ? 'supplier_invoice'
      : accountType === 'partner'
        ? 'partner_charge'
        : accountType === 'staff'
          ? 'staff_charge'
          : 'customer_charge'
    : accountType === 'supplier'
      ? 'supplier_payment'
      : accountType === 'partner'
        ? 'partner_payment'
        : accountType === 'staff'
          ? 'staff_payment'
          : 'customer_payment';
  return {
    id: `db-${movement.id}`,
    accountId: movement.accountId,
    type,
    amount: Math.abs(debit - credit),
    description: movement.description || 'Cari hareket',
    date: movement.createdAt.slice(0, 10),
  };
}

export async function loadAuthoritativeFinanceAccountTransactions() {
  const response = await runtimeFetch('/api/finance/current-account-movements', { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    movements?: AuthoritativeCurrentAccountMovement[];
    accounts?: Account[];
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `Cari hareketleri yüklenemedi: ${response.status}`);
  }
  const transactions = (payload.movements ?? []).map(mapAuthoritativeMovement);
  if (Array.isArray(payload.accounts) && payload.accounts.length > 0) {
    saveStoredAccounts(payload.accounts);
  }
  replaceStoredFinanceAccountTransactions(transactions);
  return transactions;
}

export async function createAuthoritativeFinanceAccountMovement(input: {
  action: 'record_debt' | 'record_refund' | 'record_collection' | 'record_payment' | 'record_adjustment' | 'sync_reservation_deposit';
  accountId: string;
  accountName?: string;
  accountType?: string;
  amount: number;
  method: 'cash' | 'card' | 'bank';
  description: string;
  reconciliationKey?: string;
}) {
  const response = await runtimeFetch('/api/finance/current-account-movements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      reconciliationKey: input.reconciliationKey ?? `${input.action}:${input.accountId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    movement?: AuthoritativeCurrentAccountMovement;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.movement) {
    throw new Error(payload?.error ?? `Cari hareketi kaydedilemedi: ${response.status}`);
  }
  const transaction = mapAuthoritativeMovement(payload.movement);
  appendStoredFinanceAccountTransaction(transaction);
  return transaction;
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
