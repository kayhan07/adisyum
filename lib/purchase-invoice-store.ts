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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPurchaseInvoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    emitChange();
  } catch {
    // no-op
  }
}

export function appendStoredPurchaseInvoice(invoice: StoredPurchaseInvoice) {
  const current = loadStoredPurchaseInvoices();
  saveStoredPurchaseInvoices([invoice, ...current]);
}

export function subscribeToPurchaseInvoices(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
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
