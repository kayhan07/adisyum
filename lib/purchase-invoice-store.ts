import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

export type StoredPurchaseInvoice = {
  invoiceNo: string;
  date: string;
  total: number;
  supplierName: string;
  createdAt: string;
};

const STORAGE_KEY = 'adisyon-purchase-invoices';
const EVENT_NAME = 'adisyon-purchase-invoices:changed';

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function getInvoiceKey(invoice: StoredPurchaseInvoice) {
  return [
    invoice.invoiceNo.trim().toLocaleLowerCase('tr-TR'),
    invoice.date,
    invoice.supplierName.trim().toLocaleLowerCase('tr-TR'),
    invoice.total,
    invoice.createdAt,
  ].join('|');
}

export function loadStoredPurchaseInvoices(): StoredPurchaseInvoice[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPurchaseInvoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[business-flow] purchase invoices load failed', error);
    return [];
  }
}

export function saveStoredPurchaseInvoices(invoices: StoredPurchaseInvoice[]) {
  if (typeof window === 'undefined') return;

  try {
    const existing = loadStoredPurchaseInvoices();
    const seen = new Set<string>();
    const merged = [...invoices, ...existing].filter((invoice) => {
      const key = getInvoiceKey(invoice);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(merged));
    emitChange();
  } catch (error) {
    console.error('[business-flow] purchase invoices save failed', error);
  }
}

export function appendStoredPurchaseInvoice(invoice: StoredPurchaseInvoice) {
  const current = loadStoredPurchaseInvoices();
  saveStoredPurchaseInvoices([invoice, ...current]);
}

export function subscribeToPurchaseInvoices(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = () => callback();

  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}

export function getDailyPurchaseInvoiceTotal(targetDate: string, invoices = loadStoredPurchaseInvoices()) {
  return invoices
    .filter((invoice) => invoice.date === targetDate)
    .reduce((sum, invoice) => sum + invoice.total, 0);
}

export function getDailyPurchaseInvoiceCount(targetDate: string, invoices = loadStoredPurchaseInvoices()) {
  return invoices.filter((invoice) => invoice.date === targetDate).length;
}
