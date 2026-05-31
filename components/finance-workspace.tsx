'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Banknote, Boxes, CreditCard, FileText, LineChart, Plus, Trash2, UsersRound } from 'lucide-react';
import { AccountWorkspace } from '@/components/account-workspace';
import { CashRegisterPanel } from '@/components/cash-register-panel';
import { ProductCardForm } from '@/components/product-card-form';
import {
  loadStoredAccounts,
  subscribeToStoredAccountChanges,
} from '@/lib/account-store';
import {
  appendStoredFinanceAccountTransaction,
  appendStoredFinanceInvoice,
  buildFinanceTransaction,
  loadStoredFinanceAccountTransactions,
  loadStoredFinanceInvoices,
  subscribeToFinanceRuntimeChanges,
  type StoredFinanceAccountTransaction,
  type StoredFinanceInvoice,
} from '@/lib/finance-runtime-store';
import { appendStoredPurchaseInvoice } from '@/lib/purchase-invoice-store';
import {
  loadStoredTreasuryMovements,
  subscribeToStoredTreasuryChanges,
} from '@/lib/treasury-runtime-store';
import {
  type Account,
  buildTreasuryMovementsFromAccountTransactions,
  calculateAccountBalances,
  calculateTreasuryBalances,
  erpAccountTransactions,
  erpAccounts,
  erpIngredients,
  formatQuantity,
  formatTRY,
  getIngredient,
  productRecipes,
  treasuryAccounts,
  type TreasuryMovement,
} from '@/lib/erp-engine';
import {
  DEFAULT_SALE_PRODUCT_BASE,
  loadStoredSaleProducts,
  saveStoredSaleProducts,
  type StoredSaleProduct,
} from '@/lib/sale-product-catalog';
import { useSeedBusinessDataEnabled } from '@/lib/tenant-clean-start';
import {
  loadStoredRawIngredients,
  saveStoredRawIngredients,
  type RawUnit,
  type StoredRawIngredient,
} from '@/lib/raw-ingredient-store';

type FinanceWindow = 'cash' | 'invoices' | 'accounts' | 'stock' | 'collections' | 'profit';
type InvoiceMode = 'purchase' | 'sales';
type PaymentType = 'cash' | 'card' | 'bank' | 'account';
type InvoiceLine = { id: string; name: string; quantity: string; unitPrice: string; discountRate: string; vatRate: 1 | 10 | 20 };
type InvoiceField = 'name' | 'quantity' | 'unitPrice' | 'discountRate';

const windows = [
  { id: 'cash' as const, label: 'Kasa', description: 'Nakit, banka, POS', icon: Banknote },
  { id: 'invoices' as const, label: 'Fatura', description: 'Alış ve satış', icon: FileText },
  { id: 'accounts' as const, label: 'Cari', description: 'Müşteri ve tedarikçi', icon: UsersRound },
  { id: 'stock' as const, label: 'Stok ve Ürünler', description: 'Reçete ve stok', icon: Boxes },
  { id: 'collections' as const, label: 'Tahsilat', description: 'Ödeme + tahsilat', icon: CreditCard },
  { id: 'profit' as const, label: 'Kar / Zarar', description: 'Gelir gider özeti', icon: LineChart },
];

const saleProductOptions = DEFAULT_SALE_PRODUCT_BASE.map((product) => product.name);

function normalizeLookupName(value: string) {
  return value.trim().toLocaleLowerCase('tr');
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateInvoiceTotals(lines: InvoiceLine[]) {
  const grossSubtotal = lines.reduce((sum, line) => sum + parseAmount(line.quantity) * parseAmount(line.unitPrice), 0);
  const discountTotal = lines.reduce((sum, line) => {
    const lineSubtotal = parseAmount(line.quantity) * parseAmount(line.unitPrice);
    const discountRate = Math.min(Math.max(parseAmount(line.discountRate), 0), 100);
    return sum + (lineSubtotal * discountRate) / 100;
  }, 0);
  const subtotal = grossSubtotal - discountTotal;
  const vatTotal = lines.reduce((sum, line) => {
    const lineSubtotal = parseAmount(line.quantity) * parseAmount(line.unitPrice);
    const discountRate = Math.min(Math.max(parseAmount(line.discountRate), 0), 100);
    const discountedSubtotal = lineSubtotal - (lineSubtotal * discountRate) / 100;
    return sum + discountedSubtotal * (line.vatRate / 100);
  }, 0);

  return { grossSubtotal, discountTotal, subtotal, vatTotal, total: subtotal + vatTotal };
}

function createLine(mode: InvoiceMode, index = 1): InvoiceLine {
  return {
    id: `${mode}-${Date.now()}-${index}`,
    name: mode === 'purchase' ? (erpIngredients[index % erpIngredients.length]?.name ?? 'Stok kalemi') : (saleProductOptions[index % saleProductOptions.length] ?? 'Ürün'),
    quantity: mode === 'purchase' ? '5' : '1',
    unitPrice: mode === 'purchase' ? '520' : '420',
    discountRate: '0',
    vatRate: mode === 'purchase' ? 20 : 10,
  };
}

function createBlankLine(mode: InvoiceMode, index = 1): InvoiceLine {
  return {
    id: `${mode}-blank-${Date.now()}-${index}`,
    name: '',
    quantity: '',
    unitPrice: '',
    discountRate: '0',
    vatRate: mode === 'purchase' ? 20 : 10,
  };
}

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateForInput(value: string) {
  if (!value) {
    return '';
  }

  if (value.includes('/')) {
    return value;
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function normalizeDateForStorage(value: string) {
  if (!value) {
    return getTodayIso();
  }

  if (value.includes('-')) {
    return value;
  }

  const [day, month, year] = value.split('/');
  if (!day || !month || !year) {
    return value;
  }

  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function FinanceWorkspace() {
  const [activeWindow, setActiveWindow] = useState<FinanceWindow>('cash');
  const active = windows.find((item) => item.id === activeWindow) ?? windows[0];

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-3 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {windows.map((item) => {
            const Icon = item.icon;
            const selected = activeWindow === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setActiveWindow(item.id)} className={`rounded-2xl border p-4 text-left transition duration-150 active:scale-[0.98] ${selected ? 'border-blue-400/50 bg-blue-600 text-white shadow-[0_0_30px_rgba(59,130,246,0.22)]' : 'border-white/10 bg-[#0B1220] text-slate-300 hover:bg-[#172033] hover:text-white'}`}>
                <span className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-white/15 text-white' : 'bg-white/8 text-slate-400'}`}><Icon className="h-5 w-5" /></span><span><span className="block font-semibold">{item.label}</span><span className={`mt-1 block text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>{item.description}</span></span></span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Finans penceresi</p><h2 className="mt-1 text-2xl font-semibold text-white">{active.label}</h2></div>
        {activeWindow === 'cash' ? <CashRegisterPanel /> : null}
        {activeWindow === 'invoices' ? <InvoiceWindow /> : null}
        {activeWindow === 'accounts' ? <AccountWorkspace /> : null}
        {activeWindow === 'stock' ? <StockProductsWindow /> : null}
        {activeWindow === 'collections' ? <CollectionWindow /> : null}
        {activeWindow === 'profit' ? <ProfitLossWindow /> : null}
      </section>
    </div>
  );
}

function InvoiceWindow() {
  const [mode, setMode] = useState<InvoiceMode>('purchase');
  const [partnerId, setPartnerId] = useState('');
  const [partnerQuery, setPartnerQuery] = useState('');
  const [activePartnerLookupIndex, setActivePartnerLookupIndex] = useState(0);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(formatDateForInput(getTodayIso()));
  const [dueDate, setDueDate] = useState(formatDateForInput(getTodayIso()));
  const [paymentType, setPaymentType] = useState<PaymentType>('account');
  const [lines, setLines] = useState<InvoiceLine[]>([createBlankLine('purchase', 0)]);
  const [savedInvoices, setSavedInvoices] = useState<string[]>([]);
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const [storedRuntimeTransactions, setStoredRuntimeTransactions] = useState<StoredFinanceAccountTransaction[]>([]);
  const [storedFinanceInvoices, setStoredFinanceInvoices] = useState<StoredFinanceInvoice[]>([]);
  const [storedSaleProducts, setStoredSaleProducts] = useState<StoredSaleProduct[]>([]);
  const [storedRawIngredients, setStoredRawIngredients] = useState<StoredRawIngredient[]>([]);
  const [activeLookupLineId, setActiveLookupLineId] = useState<string | null>(null);
  const [activeLookupIndex, setActiveLookupIndex] = useState(0);
  const [showStockCardForm, setShowStockCardForm] = useState(false);
  const [newStockItemType, setNewStockItemType] = useState<'raw' | 'sale'>('raw');
  const [newStockName, setNewStockName] = useState('');
  const [newStockBarcode, setNewStockBarcode] = useState('');
  const [newStockCategory, setNewStockCategory] = useState('İçecek');
  const [newStockUnit, setNewStockUnit] = useState<'kg' | 'lt' | 'adet'>('adet');
  const [newStockMinimumQuantity, setNewStockMinimumQuantity] = useState('0');
  const [newStockPurchasePrice, setNewStockPurchasePrice] = useState('0');
  const [newStockSalePrice, setNewStockSalePrice] = useState('0');
  const [newStockVatRate, setNewStockVatRate] = useState<1 | 10 | 20>(20);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);
  const seedTransactions = useMemo(() => includeSeedData ? erpAccountTransactions : [], [includeSeedData]);
  const sourceAccounts = useMemo(() => [...seedAccounts, ...storedAccounts], [seedAccounts, storedAccounts]);
  const sourceTransactions = useMemo(
    () => [...seedTransactions, ...storedRuntimeTransactions],
    [seedTransactions, storedRuntimeTransactions],
  );
  const accounts = useMemo(
    () => calculateAccountBalances(sourceAccounts, sourceTransactions),
    [sourceAccounts, sourceTransactions],
  );
  const partners = accounts.filter((account) => mode === 'purchase' ? account.type === 'supplier' : account.type === 'customer');
  const selectedPartner = partners.find((account) => account.id === partnerId) ?? null;
  const selectedPartnerLabel = selectedPartner ? `${selectedPartner.code} - ${selectedPartner.name}` : '';
  const totals = calculateInvoiceTotals(lines);
  const productLookupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          mode === 'purchase'
            ? [...erpIngredients.map((ingredient) => ingredient.name), ...storedRawIngredients.map((ingredient) => ingredient.name)]
            : [...DEFAULT_SALE_PRODUCT_BASE.map((product) => product.name), ...storedSaleProducts.map((product) => product.name)],
        ),
      ),
    [mode, storedRawIngredients, storedSaleProducts],
  );
  const partnerMatches = useMemo(() => {
    const query = partnerQuery.trim().toLocaleLowerCase('tr');
    if (query.length < 3) {
      return [];
    }

    return partners
      .filter((account) => `${account.code} - ${account.name}`.toLocaleLowerCase('tr').includes(query))
      .slice(0, 6);
  }, [partnerQuery, partners]);
  const showPartnerMatches = partnerMatches.length > 0
    && partnerQuery.trim().length >= 3
    && partnerQuery !== selectedPartnerLabel;
  useEffect(() => {
    const refresh = () => {
      setStoredAccounts(loadStoredAccounts());
      setStoredRuntimeTransactions(loadStoredFinanceAccountTransactions());
      setStoredFinanceInvoices(loadStoredFinanceInvoices());
      setStoredSaleProducts((loadStoredSaleProducts() ?? []).map((product) => ({ ...product, vatRate: product.vatRate ?? 10 })));
      setStoredRawIngredients(loadStoredRawIngredients().map((ingredient) => ({ ...ingredient, vatRate: ingredient.vatRate ?? 20 })));
    };

    refresh();
    const unsubscribeFinance = subscribeToFinanceRuntimeChanges(refresh);
    const unsubscribeAccounts = subscribeToStoredAccountChanges(refresh);
    return () => {
      unsubscribeFinance();
      unsubscribeAccounts();
    };
  }, []);

  useEffect(() => {
    if (!selectedPartner) {
      setPartnerQuery('');
      return;
    }

    setPartnerQuery(selectedPartnerLabel);
  }, [partnerId, mode]);

  function resetNewStockCardForm(nextType: 'raw' | 'sale' = mode === 'purchase' ? 'raw' : 'sale') {
    setNewStockItemType(nextType);
    setNewStockName('');
    setNewStockBarcode('');
    setNewStockCategory('İçecek');
    setNewStockUnit('adet');
    setNewStockMinimumQuantity('0');
    setNewStockPurchasePrice('0');
    setNewStockSalePrice('0');
    setNewStockVatRate(20);
  }

  function switchMode(nextMode: InvoiceMode) {
    setMode(nextMode);
    setPartnerId('');
    setPartnerQuery('');
    setActivePartnerLookupIndex(0);
    setInvoiceNo('');
    setPaymentType(nextMode === 'purchase' ? 'account' : 'cash');
    setDate(formatDateForInput(getTodayIso()));
    setDueDate(formatDateForInput(getTodayIso()));
    setLines([createBlankLine(nextMode, 0)]);
    setSavedInvoices([]);
    setActiveLookupLineId(null);
    setActiveLookupIndex(0);
    setShowStockCardForm(false);
    resetNewStockCardForm(nextMode === 'purchase' ? 'raw' : 'sale');
  }

  function resetInvoiceForm() {
    setPartnerId('');
    setPartnerQuery('');
    setActivePartnerLookupIndex(0);
    setInvoiceNo('');
    setDate(formatDateForInput(getTodayIso()));
    setDueDate(formatDateForInput(getTodayIso()));
    setLines([createBlankLine(mode, 0)]);
    setActiveLookupLineId(null);
    setActiveLookupIndex(0);
    setShowStockCardForm(false);
    resetNewStockCardForm(mode === 'purchase' ? 'raw' : 'sale');
  }

  function applyPartnerSelection(accountId: string) {
    const nextPartner = partners.find((account) => account.id === accountId);
    if (!nextPartner) {
      return;
    }

    setPartnerId(nextPartner.id);
    setPartnerQuery(`${nextPartner.code} - ${nextPartner.name}`);
    setActivePartnerLookupIndex(0);
  }

  function resolvePartnerFromInput() {
    if (selectedPartner) {
      return selectedPartner;
    }

    const query = partnerQuery.trim().toLocaleLowerCase('tr');
    if (!query) {
      return null;
    }

    const exactMatch = partners.find((account) => {
      const fullLabel = `${account.code} - ${account.name}`.toLocaleLowerCase('tr');
      return fullLabel === query
        || account.name.toLocaleLowerCase('tr') === query
        || account.code.toLocaleLowerCase('tr') === query;
    });

    if (exactMatch) {
      return exactMatch;
    }

    if (partnerMatches.length > 0) {
      return partnerMatches[activePartnerLookupIndex] ?? partnerMatches[0];
    }

    return null;
  }

  function handlePartnerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && partnerMatches.length > 0) {
      event.preventDefault();
      setActivePartnerLookupIndex((current) => (current + 1) % partnerMatches.length);
      return;
    }

    if (event.key === 'ArrowUp' && partnerMatches.length > 0) {
      event.preventDefault();
      setActivePartnerLookupIndex((current) => (current - 1 + partnerMatches.length) % partnerMatches.length);
      return;
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && partnerMatches.length > 0) {
      event.preventDefault();
      applyPartnerSelection(partnerMatches[activePartnerLookupIndex]?.id ?? partnerMatches[0].id);
    }
  }

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function removeLine(id: string) {
    setLines((current) => current.length > 1 ? current.filter((line) => line.id !== id) : current);
  }

  function getFieldKey(lineId: string, field: InvoiceField) {
    return `${lineId}:${field}`;
  }

  function focusField(lineId: string, field: InvoiceField) {
    const target = fieldRefs.current[getFieldKey(lineId, field)];
    if (!target) {
      return;
    }
    target.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }

  function appendLineAndFocus() {
    const nextLine = createLine(mode, lines.length + 1);
    setLines((current) => [...current, nextLine]);
    setTimeout(() => focusField(nextLine.id, 'name'), 0);
  }

  function moveToNextField(lineId: string, field: InvoiceField) {
    const lineIndex = lines.findIndex((line) => line.id === lineId);
    if (lineIndex === -1) {
      return;
    }

    if (field === 'name') {
      focusField(lineId, 'quantity');
      return;
    }

    if (field === 'quantity') {
      focusField(lineId, 'unitPrice');
      return;
    }

    if (field === 'unitPrice') {
      focusField(lineId, 'discountRate');
      return;
    }

    if (field === 'discountRate') {
      if (lineIndex === lines.length - 1) {
        appendLineAndFocus();
        return;
      }

      focusField(lines[lineIndex + 1].id, 'name');
      return;
    }

    if (lineIndex === lines.length - 1) {
      appendLineAndFocus();
      return;
    }

    focusField(lines[lineIndex + 1].id, 'name');
  }

  function getLookupMatches(name: string) {
    const query = name.trim().toLocaleLowerCase('tr');
    if (query.length < 3) {
      return [];
    }

    return productLookupOptions.filter((option) => option.toLocaleLowerCase('tr').includes(query)).slice(0, 6);
  }

  function findExactLookupMatch(name: string) {
    const normalized = normalizeLookupName(name);
    if (!normalized) return null;
    return productLookupOptions.find((option) => normalizeLookupName(option) === normalized) ?? null;
  }

  function resolveLineVatRate(name: string) {
    if (mode === 'purchase') {
      const storedIngredient = storedRawIngredients.find((ingredient) => normalizeLookupName(ingredient.name) === normalizeLookupName(name));
      return storedIngredient?.vatRate ?? 20;
    }

    const storedProduct = storedSaleProducts.find((product) => normalizeLookupName(product.name) === normalizeLookupName(name));
    const baseProduct = DEFAULT_SALE_PRODUCT_BASE.find((product) => normalizeLookupName(product.name) === normalizeLookupName(name));
    return storedProduct?.vatRate ?? baseProduct?.vatRate ?? 10;
  }

  function applyLookupSelection(lineId: string, value: string) {
    updateLine(lineId, { name: value, vatRate: resolveLineVatRate(value) });
    setActiveLookupLineId(null);
    setActiveLookupIndex(0);
    moveToNextField(lineId, 'name');
  }

  function handleNameInput(lineId: string, value: string) {
    const exactMatch = findExactLookupMatch(value);
    updateLine(lineId, exactMatch ? { name: value, vatRate: resolveLineVatRate(exactMatch) } : { name: value });
    const matches = getLookupMatches(value);
    setActiveLookupLineId(matches.length > 0 ? lineId : null);
    setActiveLookupIndex(0);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>, line: InvoiceLine) {
    const matches = getLookupMatches(line.name);

    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault();
      setActiveLookupLineId(line.id);
      setActiveLookupIndex((current) => (current + 1) % matches.length);
      return;
    }

    if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault();
      setActiveLookupLineId(line.id);
      setActiveLookupIndex((current) => (current - 1 + matches.length) % matches.length);
      return;
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && line.name.trim()) {
      event.preventDefault();
      if (matches.length > 0 && activeLookupLineId === line.id) {
        applyLookupSelection(line.id, matches[activeLookupIndex] ?? matches[0]);
        return;
      }

      setActiveLookupLineId(null);
      moveToNextField(line.id, 'name');
    }
  }

  function handleLinearAdvance(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, lineId: string, field: InvoiceField) {
    if (event.key !== 'Enter' && event.key !== 'Tab') {
      return;
    }

    event.preventDefault();
    moveToNextField(lineId, field);
  }

  function openStockCardForm() {
    const fallbackName = lines.find((line) => line.name.trim() && getLookupMatches(line.name).length === 0)?.name ?? '';
    resetNewStockCardForm(mode === 'purchase' ? 'raw' : 'sale');
    setNewStockName(fallbackName);
    setShowStockCardForm(true);
  }

  function saveNewStockCard() {
    const trimmedName = newStockName.trim();
    if (!trimmedName) {
      setSavedInvoices((current) => ['Stok/urun karti icin ad girin.', ...current]);
      return;
    }

    if (newStockItemType === 'raw') {
      const nextRawItems = [
        {
          id: `finance-raw-${Date.now()}`,
          name: trimmedName,
          unit: newStockUnit,
          purchasePrice: newStockPurchasePrice || '0',
          minimumQuantity: newStockMinimumQuantity || '0',
          currentQuantity: '0',
          vatRate: newStockVatRate,
        },
        ...storedRawIngredients.filter((ingredient) => normalizeLookupName(ingredient.name) !== normalizeLookupName(trimmedName)),
      ];
      saveStoredRawIngredients(nextRawItems);
      setStoredRawIngredients(nextRawItems);
    } else {
      const nextSaleProducts = [
        {
          id: `finance-sale-${Date.now()}`,
          name: trimmedName,
          category: newStockCategory,
          salesUnit: 'portion' as const,
          salePrice: newStockSalePrice || '0',
          salePrice1: newStockSalePrice || '0',
          salePrice2: newStockSalePrice || '0',
          salePrice3: newStockSalePrice || '0',
          price1WindowEnabled: true,
          price1Start: '',
          price1End: '',
          price2WindowEnabled: false,
          price2Start: '',
          price2End: '',
          allowComplimentary: true,
          allowDiscount: true,
          happyHourEligible: true,
          eventPriceEligible: true,
          vatRate: newStockVatRate,
          salesCount: 0,
          recipeLines: [],
          portionMultiplier: '1',
          recipeOverrides: [],
          wastePercentage: '0',
          operationalCost: '0',
          source: 'created' as const,
        },
        ...storedSaleProducts.filter((product) => normalizeLookupName(product.name) !== normalizeLookupName(trimmedName)),
      ];
      saveStoredSaleProducts(nextSaleProducts);
      setStoredSaleProducts(nextSaleProducts);
    }

    const targetLine = lines.find((line) => line.name.trim().toLocaleLowerCase('tr') === trimmedName.toLocaleLowerCase('tr'));
    if (targetLine) {
      updateLine(targetLine.id, {
        name: trimmedName,
        unitPrice: (newStockItemType === 'raw' ? newStockPurchasePrice : newStockSalePrice) || targetLine.unitPrice,
        vatRate: newStockVatRate,
      });
    }

    const message = newStockItemType === 'raw'
      ? `${trimmedName} hammaddesi hazırlandı. Birim: ${newStockUnit}, minimum stok: ${newStockMinimumQuantity || '0'}.`
      : `${trimmedName} satış ürünü kartı hazırlandı. Kategori: ${newStockCategory}, satış fiyatı: ${formatTRY(parseAmount(newStockSalePrice || '0'))}.`;

    setSavedInvoices((current) => [message, ...current]);
    setShowStockCardForm(false);
    resetNewStockCardForm(mode === 'purchase' ? 'raw' : 'sale');
  }

  function saveInvoice() {
    const effectivePartner = resolvePartnerFromInput();
    const hasAnyNamedLine = lines.some((line) => line.name.trim());
    const invoiceDate = normalizeDateForStorage(date);
    const invoiceDueDate = normalizeDateForStorage(dueDate);

    if (!effectivePartner) {
      setSavedInvoices((current) => ['Tedarikçi / müşteri seçmeden fatura kaydedilemez.', ...current]);
      return;
    }

    if (!hasAnyNamedLine || totals.total <= 0) {
      setSavedInvoices((current) => ['Fatura kaydetmek için en az bir geçerli satır gerekli.', ...current]);
      return;
    }

    if (mode === 'purchase') {
      appendStoredPurchaseInvoice({
        invoiceNo,
        date: invoiceDate,
        total: totals.total,
        supplierName: effectivePartner.name,
        createdAt: new Date().toISOString(),
      });
    }

    appendStoredFinanceInvoice({
      id: `inv-${Date.now()}`,
      mode,
      invoiceNo: invoiceNo || `${mode === 'purchase' ? 'AF' : 'SF'}-${Date.now()}`,
      date: invoiceDate,
      dueDate: invoiceDueDate,
      partnerId: effectivePartner.id,
      partnerName: effectivePartner.name,
      paymentType,
      total: totals.total,
      createdAt: new Date().toISOString(),
    });

    if (mode === 'purchase') {
      appendStoredFinanceAccountTransaction(
        buildFinanceTransaction({
          accountId: effectivePartner.id,
          type: 'supplier_invoice',
          amount: totals.total,
          description: `${invoiceNo || 'Yeni alış faturası'} alış faturası`,
          date: invoiceDate,
        }),
      );
    } else if (paymentType === 'account') {
      appendStoredFinanceAccountTransaction(
        buildFinanceTransaction({
          accountId: effectivePartner.id,
          type: 'customer_charge',
          amount: totals.total,
          description: `${invoiceNo || 'Yeni satış faturası'} satış faturası`,
          date: invoiceDate,
        }),
      );
    }

    const message = mode === 'purchase'
      ? `${invoiceNo || 'Yeni'} alış faturası kaydedildi. Stok arttı, ${effectivePartner.name} carisine ${formatTRY(totals.total)} borç ve gider işlendi.`
      : `${invoiceNo || 'Yeni'} satış faturası kaydedildi. Stok düştü, ${paymentType === 'account' ? `${effectivePartner.name} carisine alacak işlendi` : 'tahsilat kasa/banka hesabına işlendi'}.`;
    setSavedInvoices((current) => [message, ...current]);
    resetInvoiceForm();
  }

  return (
    <section className="space-y-5">
      <article className="rounded-[1.5rem] border border-blue-400/20 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-white">Fatura yönetimi</h3>
            <p className="mt-1 text-sm text-slate-400">Alış faturası stok ve tedarikçi borcu oluşturur. Satış faturası stok düşer, gelir ve tahsilat/cari alacak oluşturur.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#0B1220] p-1">
            <button type="button" onClick={() => switchMode('purchase')} className={`h-11 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] ${mode === 'purchase' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>Alış Faturası</button>
            <button type="button" onClick={() => switchMode('sales')} className={`h-11 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] ${mode === 'sales' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>Satış Faturası</button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative block xl:col-span-2">
            <span className="text-sm text-slate-400">{mode === 'purchase' ? 'Tedarikçi' : 'Müşteri'}</span>
            <input
              value={partnerQuery}
              onChange={(event) => {
                setPartnerQuery(event.target.value);
                setActivePartnerLookupIndex(0);
              }}
              onKeyDown={handlePartnerKeyDown}
              placeholder={mode === 'purchase' ? 'Tedarikçi ara... en az 3 harf yaz' : 'Müşteri ara... en az 3 harf yaz'}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500"
            />
            {showPartnerMatches ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-[0_18px_42px_rgba(2,6,23,0.42)]">
                {partnerMatches.map((account, index) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => applyPartnerSelection(account.id)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                      index === activePartnerLookupIndex ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-semibold">{account.code} - {account.name}</span>
                    <span className="text-xs text-slate-500">{mode === 'purchase' ? 'Tedarikçi' : 'Müşteri'}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="block"><span className="text-sm text-slate-400">Fatura no</span><input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
          <label className="block"><span className="text-sm text-slate-400">Tarih</span><input value={date} onChange={(event) => setDate(maskDateInput(event.target.value))} inputMode="numeric" maxLength={10} placeholder="gg/aa/yyyy" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500" /></label>
          <label className="block"><span className="text-sm text-slate-400">Vade tarihi</span><input value={dueDate} onChange={(event) => setDueDate(maskDateInput(event.target.value))} inputMode="numeric" maxLength={10} placeholder="gg/aa/yyyy" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500" /></label>
        </div>
      </article>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
          <header className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Ürün listesi</h3>
              <p className="mt-1 text-sm text-slate-400">3 harf sonra stoktan süz, Enter veya Tab ile ilerle, ürün bazlı iskonto uygula, son sütunda yeni satır aç.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={openStockCardForm} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 active:scale-[0.98]">
                <Plus className="h-4 w-4" /> Stok kartı oluştur
              </button>
              <button type="button" onClick={appendLineAndFocus} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]">
                <Plus className="h-4 w-4" /> Ürün ekle
              </button>
            </div>
          </header>

          {showStockCardForm ? (
            <ProductCardForm
              eyebrow="Yeni stok kartı"
              title="Hammadde veya satış ürünü oluştur"
              description="Stokta olmayan ürün için doğru kart tipini seç. Aynı kart hem fatura hem ürün akışında kullanılır."
              onClose={() => { setShowStockCardForm(false); resetNewStockCardForm(mode === 'purchase' ? 'raw' : 'sale'); }}
              itemType={newStockItemType}
              onItemTypeChange={(value) => {
                const nextType = value === 'raw' ? 'raw' : 'sale';
                setNewStockItemType(nextType);
                setNewStockVatRate(nextType === 'raw' ? 20 : 10);
              }}
              name={newStockName}
              onNameChange={setNewStockName}
              barcode={newStockBarcode}
              onBarcodeChange={setNewStockBarcode}
              showBarcode
              category={newStockCategory}
              onCategoryChange={setNewStockCategory}
              salePrice={newStockSalePrice}
              onSalePriceChange={setNewStockSalePrice}
              purchasePrice={newStockPurchasePrice}
              onPurchasePriceChange={setNewStockPurchasePrice}
              showPurchasePrice
              unit={newStockUnit}
              onUnitChange={setNewStockUnit}
              minimumQuantity={newStockMinimumQuantity}
              onMinimumQuantityChange={setNewStockMinimumQuantity}
              vatRate={newStockVatRate}
              onVatRateChange={setNewStockVatRate}
              showVat
              submitLabel={newStockItemType === 'raw' ? 'Hammadde kartını hazırla' : 'Satış ürünü kartını hazırla'}
              onSubmit={saveNewStockCard}
              onCancel={() => { setShowStockCardForm(false); resetNewStockCardForm(mode === 'purchase' ? 'raw' : 'sale'); }}
            />
          ) : null}

            <div className="p-4">
            <div className="overflow-visible rounded-2xl border border-white/10">
              <div className="grid grid-cols-[minmax(14rem,1.9fr)_4.8rem_6rem_4.8rem_4.8rem_6.5rem_2.5rem] items-center gap-3 bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>Ürün</span>
                <span className="text-center">Miktar</span>
                <span className="text-center">Birim fiyat</span>
                <span className="text-center">İsk.</span>
                <span className="text-center">KDV</span>
                <span className="text-right">Toplam</span>
                <span />
              </div>
              <div className="divide-y divide-white/10">
                {lines.map((line) => {
                  const lineSubtotal = parseAmount(line.quantity) * parseAmount(line.unitPrice);
                  const discountRate = Math.min(Math.max(parseAmount(line.discountRate), 0), 100);
                  const lineDiscount = lineSubtotal * (discountRate / 100);
                  const discountedSubtotal = lineSubtotal - lineDiscount;
                  const lineTotal = discountedSubtotal + discountedSubtotal * (line.vatRate / 100);
                  const lookupMatches = getLookupMatches(line.name);
                  const showLookup = activeLookupLineId === line.id && lookupMatches.length > 0;

                  return (
                    <div key={line.id} className="grid grid-cols-[minmax(14rem,1.9fr)_4.8rem_6rem_4.8rem_4.8rem_6.5rem_2.5rem] items-center gap-3 bg-[#111827] px-4 py-3">
                      <div className="relative min-w-0">
                        <input ref={(element) => { fieldRefs.current[getFieldKey(line.id, 'name')] = element; }} value={line.name} onChange={(event) => handleNameInput(line.id, event.target.value)} onFocus={() => { const matches = getLookupMatches(line.name); setActiveLookupLineId(matches.length > 0 ? line.id : null); setActiveLookupIndex(0); }} onBlur={() => setTimeout(() => setActiveLookupLineId((current) => current === line.id ? null : current), 120)} onKeyDown={(event) => handleNameKeyDown(event, line)} placeholder={mode === 'purchase' ? 'Stok ürünü ara / yeni ürün gir' : 'Ürün ara'} className="h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none" />
                        {showLookup ? <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-xl border border-white/10 bg-[#0B1220] shadow-[0_18px_42px_rgba(2,6,23,0.4)]">{lookupMatches.map((option, index) => <button key={option} type="button" onMouseDown={(event) => { event.preventDefault(); applyLookupSelection(line.id, option); }} className={`flex h-10 w-full items-center px-3 text-left text-sm transition ${activeLookupIndex === index ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}>{option}</button>)}{mode === 'purchase' ? <div className="border-t border-white/10 px-3 py-2 text-xs text-amber-200">Listede yoksa üstteki butondan stok kartı açabilirsin.</div> : null}</div> : null}
                      </div>
                      <input ref={(element) => { fieldRefs.current[getFieldKey(line.id, 'quantity')] = element; }} value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} onKeyDown={(event) => handleLinearAdvance(event, line.id, 'quantity')} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-0 text-center font-semibold text-white outline-none" />
                      <input ref={(element) => { fieldRefs.current[getFieldKey(line.id, 'unitPrice')] = element; }} value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })} onKeyDown={(event) => handleLinearAdvance(event, line.id, 'unitPrice')} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-0 text-center font-semibold text-white outline-none" />
                      <input ref={(element) => { fieldRefs.current[getFieldKey(line.id, 'discountRate')] = element; }} value={line.discountRate} onChange={(event) => updateLine(line.id, { discountRate: event.target.value })} onKeyDown={(event) => handleLinearAdvance(event, line.id, 'discountRate')} placeholder="0" className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-0 text-center font-semibold text-white outline-none" />
                      <div className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] text-center font-semibold text-white">%{line.vatRate}</div>
                      <span className="min-w-0 whitespace-nowrap text-right font-semibold text-white">{formatTRY(lineTotal)}</span>
                      <button type="button" onClick={() => removeLine(line.id)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 active:scale-[0.98]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </article>

        <aside className="space-y-4">
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
            <h3 className="text-xl font-semibold text-white">Toplam ve ödeme</h3>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>Brüt toplam</span>
                <span className="font-semibold text-white">{formatTRY(totals.grossSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>İskonto toplamı</span>
                <span className="font-semibold text-rose-200">- {formatTRY(totals.discountTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>Ara toplam</span>
                <span className="font-semibold text-white">{formatTRY(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>KDV toplamı</span>
                <span className="font-semibold text-amber-200">{formatTRY(totals.vatTotal)}</span>
              </div>
              <div className="rounded-2xl bg-blue-500/10 p-4">
                <p className="text-sm text-blue-200/70">Genel toplam</p>
                <p className="mt-1 text-3xl font-semibold text-white">{formatTRY(totals.total)}</p>
              </div>
            </div>

            {mode === 'sales' ? (
              <div className="mt-5">
                <p className="mb-2 text-sm text-slate-400">Ödeme tipi</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['cash', 'Nakit'],
                    ['card', 'Kart'],
                    ['bank', 'Banka'],
                    ['account', 'Cari'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentType(id as PaymentType)}
                      className={`h-11 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${
                        paymentType === id ? 'bg-blue-600 text-white' : 'border border-white/10 bg-[#0B1220] text-slate-300 hover:bg-[#172033]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={saveInvoice}
              className={`mt-5 h-14 w-full rounded-2xl text-base font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition active:scale-[0.98] ${
                mode === 'purchase' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              Faturayı kaydet
            </button>
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
            <h3 className="text-lg font-semibold text-white">Sistem etkisi</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              {(mode === 'purchase'
                ? ['Stok otomatik artar', 'Tedarikçi cari borcu oluşur', 'Gider kaydı açılır']
                : ['Stok otomatik düşer', 'Gelir kaydı açılır', paymentType === 'account' ? 'Müşteri cari alacağı oluşur' : 'Kasa / banka girişi oluşur']
              ).map((item) => (
                <p key={item} className="rounded-2xl bg-[#0B1220]/70 px-4 py-3">
                  {item}
                </p>
              ))}
            </div>
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Fatura geçmişi</h3>
                <p className="mt-1 text-sm text-slate-400">Kaydedilen faturaları burada hemen gör.</p>
              </div>
              <span className="rounded-full bg-blue-500/12 px-3 py-1 text-xs font-semibold text-blue-200">
                {storedFinanceInvoices.length} kayıt
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {storedFinanceInvoices.length > 0 ? (
                storedFinanceInvoices.slice(0, 6).map((invoice) => (
                  <div key={invoice.id} className="rounded-2xl border border-white/10 bg-[#0B1220]/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{invoice.invoiceNo}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {invoice.mode === 'purchase' ? 'Alış faturası' : 'Satış faturası'} · {invoice.partnerName}
                        </p>
                      </div>
                      <p className="font-semibold text-white">{formatTRY(invoice.total)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {invoice.date} · {invoice.paymentType === 'account' ? 'Cari' : invoice.paymentType === 'cash' ? 'Nakit' : invoice.paymentType === 'card' ? 'Kart' : 'Banka'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B1220]/50 px-4 py-4 text-sm text-slate-400">
                  Henüz kayıtlı fatura yok.
                </div>
              )}
            </div>
          </article>

          {savedInvoices.map((item) => (
            <p key={item} className="rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-200">
              {item}
            </p>
          ))}
        </aside>
      </section>
    </section>
  );
}
function StockProductsWindow() {
  const [storedRawItems, setStoredRawItems] = useState<StoredRawIngredient[]>([]);
  const [storedSaleItems, setStoredSaleItems] = useState<StoredSaleProduct[]>([]);

  const [showStockCardForm, setShowStockCardForm] = useState(false);
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null);
  const [stockCardItemType, setStockCardItemType] = useState<'raw' | 'sale'>('raw');
  const [stockCardName, setStockCardName] = useState('');
  const [stockCardBarcode, setStockCardBarcode] = useState('');
  const [stockCardCategory, setStockCardCategory] = useState('Finans');
  const [stockCardSalePrice, setStockCardSalePrice] = useState('0');
  const [stockCardPurchasePrice, setStockCardPurchasePrice] = useState('0');
  const [stockCardUnit, setStockCardUnit] = useState<RawUnit>('adet');
  const [stockCardCurrentQuantity, setStockCardCurrentQuantity] = useState('0');
  const [stockCardMinimumQuantity, setStockCardMinimumQuantity] = useState('0');
  const [stockCardVatRate, setStockCardVatRate] = useState<1 | 10 | 20>(20);
  const [stockCardSavedMessage, setStockCardSavedMessage] = useState('');
  const [showStockCardToast, setShowStockCardToast] = useState(false);
  const [activeRawIngredientId, setActiveRawIngredientId] = useState<string | null>(null);
  const [activeSaleProductName, setActiveSaleProductName] = useState<string | null>(null);

  useEffect(() => {
    setStoredRawItems(loadStoredRawIngredients().map((item) => ({ ...item, vatRate: item.vatRate ?? 20 })));
    setStoredSaleItems((loadStoredSaleProducts() ?? []).map((item) => ({ ...item, vatRate: item.vatRate ?? 10 })));
  }, []);

  useEffect(() => {
    if (!stockCardSavedMessage) {
      setShowStockCardToast(false);
      return;
    }

    setShowStockCardToast(true);

    const hideTimeout = window.setTimeout(() => {
      setShowStockCardToast(false);
    }, 1700);

    const clearTimeout = window.setTimeout(() => {
      setStockCardSavedMessage('');
    }, 2200);

    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [stockCardSavedMessage]);

  const rows = useMemo(() => erpIngredients.map((ingredient, index) => {
    const stored = storedRawItems.find((item) => item.id === ingredient.id || normalizeLookupName(item.name) === normalizeLookupName(ingredient.name));
    const displayUnit = (stored?.unit ?? ingredient.unit) as RawUnit | 'gr' | 'ml';
    const quantity = stored ? parseAmount(stored.currentQuantity) : 0;
    const minimumQuantity = stored ? parseAmount(stored.minimumQuantity) : 0;
    const averageCost = stored ? parseAmount(stored.purchasePrice) : 0;

    return {
      branchId: 'mrk',
      ingredientId: ingredient.id,
      displayName: stored?.name ?? ingredient.name,
      displayUnit,
      averageCost,
      quantity,
      minimumQuantity,
      vatRate: stored?.vatRate ?? 20,
      _rowIndex: index,
    };
  }), [storedRawItems]);

  const saleProducts = useMemo(() => productRecipes.map((recipe) => {
    const cost = recipe.ingredients.reduce((sum, line) => {
      const stock = rows.find((item) => item.ingredientId === line.ingredientId);
      return sum + ((stock?.averageCost ?? 0) * line.quantity);
    }, 0);
    const stored = storedSaleItems.find((item) => item.id === recipe.productName || normalizeLookupName(item.name) === normalizeLookupName(recipe.productName));

    return {
      productName: recipe.productName,
      displayName: stored?.name ?? recipe.productName,
      ingredientCount: recipe.ingredients.length,
      estimatedCost: cost,
      salePrice: stored?.salePrice ?? `${cost}`,
      category: stored?.category ?? 'Satış Ürünü',
      vatRate: stored?.vatRate ?? 10,
      ingredients: recipe.ingredients.map((line) => {
        const ingredient = getIngredient(line.ingredientId);
        return {
          id: line.ingredientId,
          name: ingredient?.name ?? line.ingredientId,
          quantityLabel: ingredient ? formatQuantity(line.quantity, ingredient.unit) : `${line.quantity}`,
        };
      }),
    };
  }), [rows, storedSaleItems]);

  function closeStockCardForm() {
    setShowStockCardForm(false);
    setActiveCardKey(null);
    setActiveRawIngredientId(null);
    setActiveSaleProductName(null);
  }

  function openRawStockCard(stock: (typeof rows)[number]) {
    const normalizedUnit: RawUnit = stock.displayUnit === 'gr' ? 'kg' : stock.displayUnit === 'ml' ? 'lt' : stock.displayUnit;
    setStockCardItemType('raw');
    setStockCardName(stock.displayName);
    setStockCardBarcode('');
    setStockCardCategory('Hammadde');
    setStockCardSalePrice('0');
    setStockCardPurchasePrice(`${stock.averageCost}`);
    setStockCardUnit(normalizedUnit);
    setStockCardCurrentQuantity(`${stock.quantity}`);
    setStockCardMinimumQuantity(`${stock.minimumQuantity}`);
    setStockCardVatRate(stock.vatRate);
    setActiveRawIngredientId(stock.ingredientId);
    setActiveSaleProductName(null);
    setActiveCardKey(`raw-${stock.ingredientId}`);
    setShowStockCardForm(true);
  }

  function openSaleStockCard(product: (typeof saleProducts)[number]) {
    setStockCardItemType('sale');
    setStockCardName(product.displayName);
    setStockCardBarcode('');
    setStockCardCategory(product.category);
    setStockCardSalePrice(product.salePrice);
    setStockCardPurchasePrice('0');
    setStockCardUnit('adet');
    setStockCardCurrentQuantity('0');
    setStockCardMinimumQuantity('0');
    setStockCardVatRate(product.vatRate);
    setActiveSaleProductName(product.productName);
    setActiveRawIngredientId(null);
    setActiveCardKey(`sale-${product.productName}`);
    setShowStockCardForm(true);
  }

  function saveStockCard() {
    const trimmedName = stockCardName.trim();
    if (!trimmedName) {
      setStockCardSavedMessage('Kart adi girin.');
      return;
    }

    if (stockCardItemType === 'raw' && activeRawIngredientId) {
      const originalIngredientName = getIngredient(activeRawIngredientId)?.name ?? activeRawIngredientId;
      const nextRawItems = [
        {
          id: activeRawIngredientId,
          name: trimmedName,
          unit: stockCardUnit,
          purchasePrice: stockCardPurchasePrice || '0',
          minimumQuantity: stockCardMinimumQuantity || '0',
          currentQuantity: stockCardCurrentQuantity || '0',
          vatRate: stockCardVatRate,
        },
        ...storedRawItems.filter((item) => item.id !== activeRawIngredientId && normalizeLookupName(item.name) !== normalizeLookupName(originalIngredientName)),
      ];
      saveStoredRawIngredients(nextRawItems);
      setStoredRawItems(nextRawItems);
      setStockCardSavedMessage(`${trimmedName} stok kartı kaydedildi.`);
      closeStockCardForm();
      return;
    }

    if (stockCardItemType === 'sale' && activeSaleProductName) {
      const existing = storedSaleItems.find((item) => item.id === activeSaleProductName || normalizeLookupName(item.name) === normalizeLookupName(activeSaleProductName));
      const nextSaleProducts = [
        {
          id: existing?.id ?? activeSaleProductName,
          name: trimmedName,
          category: stockCardCategory || 'Satış Ürünü',
          salesUnit: (existing?.salesUnit ?? 'portion') as import('@/lib/sale-product-catalog').SaleUnitType,
          salePrice: stockCardSalePrice || '0',
          salePrice1: existing?.salePrice1 ?? stockCardSalePrice ?? '0',
          salePrice2: existing?.salePrice2 ?? stockCardSalePrice ?? '0',
          salePrice3: existing?.salePrice3 ?? stockCardSalePrice ?? '0',
          price1WindowEnabled: existing?.price1WindowEnabled ?? true,
          price1Start: existing?.price1Start ?? '',
          price1End: existing?.price1End ?? '',
          price2WindowEnabled: existing?.price2WindowEnabled ?? false,
          price2Start: existing?.price2Start ?? '',
          price2End: existing?.price2End ?? '',
          allowComplimentary: existing?.allowComplimentary ?? true,
          allowDiscount: existing?.allowDiscount ?? true,
          happyHourEligible: existing?.happyHourEligible ?? true,
          eventPriceEligible: existing?.eventPriceEligible ?? true,
          vatRate: stockCardVatRate,
          salesCount: existing?.salesCount ?? 0,
          recipeLines: existing?.recipeLines ?? [],
          recipeId: existing?.recipeId,
          portionMultiplier: existing?.portionMultiplier,
          recipeOverrides: existing?.recipeOverrides,
          recipeTemplateId: existing?.recipeTemplateId,
          recipeOverride: existing?.recipeOverride,
          wastePercentage: existing?.wastePercentage,
          operationalCost: existing?.operationalCost,
          source: existing?.source ?? 'seeded',
        },
        ...storedSaleItems.filter((item) => item.id !== activeSaleProductName && normalizeLookupName(item.name) !== normalizeLookupName(activeSaleProductName)),
      ];
      saveStoredSaleProducts(nextSaleProducts);
      setStoredSaleItems(nextSaleProducts);
      setStockCardSavedMessage(`${trimmedName} ürün kartı kaydedildi.`);
      closeStockCardForm();
    }
  }

  return (
    <section className="space-y-5">
      {stockCardSavedMessage ? (
        <div className="pointer-events-none fixed right-6 top-24 z-50">
          <p className={`rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 shadow-[0_18px_42px_rgba(2,6,23,0.28)] backdrop-blur-sm transition-all duration-300 ${showStockCardToast ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
            {stockCardSavedMessage}
          </p>
        </div>
      ) : null}

      {showStockCardForm ? (
        <ProductCardForm
          eyebrow="Stok kartı"
          title="Seçili kart bilgileri"
          description="Finans stok ekranından seçilen kartın detaylarını buradan inceleyebilirsin."
          onClose={closeStockCardForm}
          itemType={stockCardItemType}
          onItemTypeChange={(value) => {
            const nextType = value === 'raw' ? 'raw' : 'sale';
            setStockCardItemType(nextType);
            setStockCardVatRate(nextType === 'raw' ? 20 : 10);
          }}
          name={stockCardName}
          onNameChange={setStockCardName}
          barcode={stockCardBarcode}
          onBarcodeChange={setStockCardBarcode}
          showBarcode
          category={stockCardCategory}
          onCategoryChange={setStockCardCategory}
          salePrice={stockCardSalePrice}
          onSalePriceChange={setStockCardSalePrice}
          purchasePrice={stockCardPurchasePrice}
          onPurchasePriceChange={setStockCardPurchasePrice}
          showPurchasePrice
          unit={stockCardUnit}
          onUnitChange={setStockCardUnit}
          currentQuantity={stockCardCurrentQuantity}
          onCurrentQuantityChange={setStockCardCurrentQuantity}
          showCurrentQuantity
          minimumQuantity={stockCardMinimumQuantity}
          onMinimumQuantityChange={setStockCardMinimumQuantity}
          vatRate={stockCardVatRate}
          onVatRateChange={setStockCardVatRate}
          showVat
          submitLabel="Kartı kaydet"
          onSubmit={saveStockCard}
          onCancel={closeStockCardForm}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <header className="border-b border-white/10 p-5">
          <h3 className="text-xl font-semibold text-white">Hammadde stokları</h3>
          <p className="mt-1 text-sm text-slate-400">Depoda tutulan üretim kalemleri. Bunlar reçetede kullanılır, masa ve menü tarafında görünmez.</p>
        </header>
        <div className="overflow-hidden p-4">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.55fr] items-center gap-3 bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Hammadde</span>
              <span>Mevcut</span>
              <span>Minimum</span>
              <span>Durum</span>
            </div>
            <div className="divide-y divide-white/10">
              {rows.map((stock) => {
                const ingredient = getIngredient(stock.ingredientId);
                const critical = stock.quantity <= stock.minimumQuantity;
                const selected = activeCardKey === `raw-${stock.ingredientId}`;

                return (
                  <button
                    key={`${stock.branchId}-${stock.ingredientId}`}
                    type="button"
                    onClick={() => openRawStockCard(stock)}
                    className={`grid w-full grid-cols-[1.2fr_0.6fr_0.6fr_0.55fr] items-center gap-3 px-4 py-3 text-left text-sm transition ${selected ? 'bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]' : 'bg-[#111827] hover:bg-[#172033]'}`}
                  >
                    <div>
                      <p className="font-semibold text-white">{stock.displayName}</p>
                      <p className="mt-1 text-xs text-slate-500">Ortalama maliyet {formatTRY(stock.averageCost)}</p>
                    </div>
                    <span className="font-semibold text-slate-100">{formatQuantity(stock.quantity, stock.displayUnit)}</span>
                    <span className="text-slate-400">{formatQuantity(stock.minimumQuantity, stock.displayUnit)}</span>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${critical ? 'bg-rose-500/15 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{critical ? 'Kritik' : 'Sağlıklı'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </article>

      <div className="space-y-5">
        <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
          <h3 className="text-xl font-semibold text-white">Satış ürünleri</h3>
          <p className="mt-1 text-sm text-slate-400">POS, masa ve menüde görünen ürünler. Hammadde yerine sadece satılan ürün kartları listelenir.</p>
          <div className="mt-5 space-y-3">
            {saleProducts.map((product) => {
              const selected = activeCardKey === `sale-${product.productName}`;

              return (
              <button
                key={product.productName}
                type="button"
                onClick={() => openSaleStockCard(product)}
                className={`w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${selected ? 'border-sky-300/40 bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]' : 'border-white/10 bg-[#0B1220]/70 hover:bg-[#172033]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{product.displayName}</p>
                    <p className="mt-1 text-sm text-slate-500">{product.ingredientCount} reçete kalemi</p>
                  </div>
                  <div className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-100">Maliyeti {formatTRY(product.estimatedCost)}</div>
                </div>
              </button>
            );})}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
          <h3 className="text-lg font-semibold text-white">Ürün reçetesi</h3>
          <p className="mt-1 text-sm text-slate-400">Bir satış ürünü seçildiğinde mutfak tarafında hangi hammaddelerden üretildiği bu mantıkla işlenir.</p>
          <div className="mt-5 space-y-3">
            {saleProducts.slice(0, 4).map((product) => (
              <div key={product.productName} className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                <p className="font-semibold text-white">{product.displayName}</p>
                <div className="mt-3 space-y-2">
                  {product.ingredients.map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-sm text-slate-400">
                      <span>{line.name}</span>
                      <span className="font-semibold text-slate-100">{line.quantityLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
      </div>
    </section>
  );
}

function CollectionWindow() {
  const [mode, setMode] = useState<'collection' | 'payment'>('collection');
  const [selectedCollectionAccountId, setSelectedCollectionAccountId] = useState('cus-ahmet');
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState('sup-gida');
  const [amount, setAmount] = useState('500');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank'>('cash');
  const [saved, setSaved] = useState<Array<{ text: string; direction: 'in' | 'out' }>>([]);
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const [storedTransactions, setStoredTransactions] = useState<StoredFinanceAccountTransaction[]>([]);
  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);
  const seedTransactions = useMemo(() => includeSeedData ? erpAccountTransactions : [], [includeSeedData]);
  const sourceAccounts = useMemo(() => [...seedAccounts, ...storedAccounts], [seedAccounts, storedAccounts]);
  const sourceTransactions = useMemo(
    () => [...seedTransactions, ...storedTransactions],
    [seedTransactions, storedTransactions],
  );
  const balances = useMemo(
    () => calculateAccountBalances(sourceAccounts, sourceTransactions),
    [sourceAccounts, sourceTransactions],
  );
  const collectionAccounts = balances.filter((account) => account.type === 'customer' || account.type === 'partner');
  const paymentAccounts = balances.filter((account) => account.type === 'supplier' || account.type === 'staff' || account.type === 'partner');
  const selectedCollectionAccount = collectionAccounts.find((account) => account.id === selectedCollectionAccountId) ?? collectionAccounts[0];
  const selectedPaymentAccount = paymentAccounts.find((account) => account.id === selectedPaymentAccountId) ?? paymentAccounts[0];
  const currentAccount = mode === 'collection' ? selectedCollectionAccount : selectedPaymentAccount;

  useEffect(() => {
    const refresh = () => {
      setStoredAccounts(loadStoredAccounts());
      setStoredTransactions(loadStoredFinanceAccountTransactions());
    };

    refresh();
    const unsubscribeFinance = subscribeToFinanceRuntimeChanges(refresh);
    const unsubscribeAccounts = subscribeToStoredAccountChanges(refresh);
    return () => {
      unsubscribeFinance();
      unsubscribeAccounts();
    };
  }, []);

  useEffect(() => {
    if (!collectionAccounts.some((account) => account.id === selectedCollectionAccountId)) {
      setSelectedCollectionAccountId(collectionAccounts[0]?.id ?? '');
    }
  }, [collectionAccounts, selectedCollectionAccountId]);

  useEffect(() => {
    if (!paymentAccounts.some((account) => account.id === selectedPaymentAccountId)) {
      setSelectedPaymentAccountId(paymentAccounts[0]?.id ?? '');
    }
  }, [paymentAccounts, selectedPaymentAccountId]);

  function saveTransaction() {
    const numericAmount = Number(amount.replace(',', '.')) || 0;
    if (numericAmount <= 0 || !currentAccount) {
      setSaved((current) => [{
        text: !currentAccount ? 'Cari hesap secin.' : 'Gecerli tutar girin.',
        direction: mode === 'collection' ? 'in' : 'out',
      }, ...current]);
      return;
    }
    const transactionType = mode === 'collection'
      ? currentAccount.type === 'partner'
        ? 'customer_payment'
        : 'customer_payment'
      : currentAccount.type === 'partner'
        ? 'partner_payment'
        : currentAccount.type === 'staff'
          ? 'staff_payment'
          : 'supplier_payment';
    const methodLabel = method === 'cash' ? 'nakit' : method === 'card' ? 'kart' : 'banka';
    appendStoredFinanceAccountTransaction(
      buildFinanceTransaction({
        accountId: currentAccount.id,
        type: transactionType,
        amount: numericAmount,
        description: `${methodLabel} ile ${mode === 'collection' ? 'tahsilat' : 'odeme'}`,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
    const text = mode === 'collection' ? `${currentAccount.name} müşterisinden ${formatTRY(numericAmount)} tahsilat alındı.` : `${currentAccount.name} carisine ${formatTRY(numericAmount)} ödeme yapıldı.`;
    setSaved((current) => [{ text, direction: mode === 'collection' ? 'in' : 'out' }, ...current]);
    setAmount('');
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <h3 className="text-xl font-semibold text-white">Ödeme + Tahsilat</h3>
        <p className="mt-1 text-sm text-slate-400">Müşteriden alınan para tahsilattır; tedarikçi, personel veya ortağa çıkan para ödemedir.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#0B1220] p-1"><button type="button" onClick={() => setMode('collection')} className={`h-12 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${mode === 'collection' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>Tahsilat al</button><button type="button" onClick={() => setMode('payment')} className={`h-12 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${mode === 'payment' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>Ödeme yap</button></div>
        {mode === 'collection' ? <label className="mt-5 block"><span className="text-sm text-slate-400">Müşteri cari</span><select value={selectedCollectionAccountId} onChange={(event) => setSelectedCollectionAccountId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none">{collectionAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></label> : <label className="mt-5 block"><span className="text-sm text-slate-400">Ödeme yapılacak cari</span><select value={selectedPaymentAccountId} onChange={(event) => setSelectedPaymentAccountId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none">{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></label>}
        <label className="mt-4 block"><span className="text-sm text-slate-400">Tutar</span><input value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-2xl font-semibold text-white outline-none" /></label>
        <div className="mt-4 grid grid-cols-3 gap-2">{[['cash', 'Nakit'], ['card', 'Kart / POS'], ['bank', 'Banka']].map(([id, label]) => <button key={id} type="button" onClick={() => setMethod(id as 'cash' | 'card' | 'bank')} className={`h-11 rounded-2xl text-sm font-semibold transition active:scale-[0.98] ${method === id ? 'bg-blue-600 text-white' : 'border border-white/10 bg-[#0B1220] text-slate-300 hover:bg-[#172033]'}`}>{label}</button>)}</div>
        <button type="button" onClick={saveTransaction} className={`mt-4 h-14 w-full rounded-2xl text-base font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition active:scale-[0.98] ${mode === 'collection' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>{mode === 'collection' ? 'Tahsilatı kaydet' : 'Ödemeyi kaydet'}</button>
      </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]"><h3 className="text-xl font-semibold text-white">Açık bakiyeler</h3><div className="mt-5 grid gap-5 lg:grid-cols-2"><div><p className="mb-3 text-sm font-semibold text-emerald-200">Tahsilat yapılacak müşteri / ortak carileri</p><div className="space-y-3">{collectionAccounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220]/70 px-4 py-3"><div><p className="font-semibold text-white">{account.name}</p><p className="mt-1 text-sm text-slate-500">{account.code}</p></div><p className="font-semibold text-amber-200">{formatTRY(account.balance)}</p></div>)}</div></div><div><p className="mb-3 text-sm font-semibold text-rose-200">Ödeme yapılacak cariler</p><div className="space-y-3">{paymentAccounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220]/70 px-4 py-3"><div><p className="font-semibold text-white">{account.name}</p><p className="mt-1 text-sm text-slate-500">{account.code}</p></div><p className="font-semibold text-rose-200">{formatTRY(account.balance)}</p></div>)}</div></div></div><div className="mt-5 space-y-3">{saved.map((item, index) => <p key={`${item.text}-${index}`} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${item.direction === 'in' ? 'bg-emerald-500/12 text-emerald-200' : 'bg-rose-500/12 text-rose-200'}`}>{item.text}</p>)}</div></article>
    </section>
  );
}

function ProfitLossWindow() {
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const [storedTransactions, setStoredTransactions] = useState<StoredFinanceAccountTransaction[]>([]);
  const [storedTreasuryMovements, setStoredTreasuryMovements] = useState<TreasuryMovement[]>([]);
  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);
  const seedTransactions = useMemo(() => includeSeedData ? erpAccountTransactions : [], [includeSeedData]);
  const sourceAccounts = useMemo(() => [...seedAccounts, ...storedAccounts], [seedAccounts, storedAccounts]);
  const sourceTransactions = useMemo(
    () => [...seedTransactions, ...storedTransactions],
    [seedTransactions, storedTransactions],
  );
  const movements = useMemo(() => {
    const baseMovements = buildTreasuryMovementsFromAccountTransactions(sourceTransactions, sourceAccounts);
    return [...baseMovements, ...storedTreasuryMovements];
  }, [sourceAccounts, sourceTransactions, storedTreasuryMovements]);
  const balances = calculateTreasuryBalances(treasuryAccounts, movements);
  const income = movements.filter((movement) => movement.direction === 'in').reduce((sum, movement) => sum + movement.amount, 0);
  const treasuryExpense = movements.filter((movement) => movement.direction === 'out').reduce((sum, movement) => sum + movement.amount, 0);
  const stockCost = sourceTransactions
    .filter((transaction) => transaction.type === 'supplier_invoice')
    .reduce((sum, transaction) => sum + (transaction.amount * 0.35), 0);
  const netProfit = income - treasuryExpense - stockCost;

  useEffect(() => {
    const refresh = () => {
      setStoredAccounts(loadStoredAccounts());
      setStoredTransactions(loadStoredFinanceAccountTransactions());
      setStoredTreasuryMovements(loadStoredTreasuryMovements());
    };

    refresh();
    const unsubscribeFinance = subscribeToFinanceRuntimeChanges(refresh);
    const unsubscribeAccounts = subscribeToStoredAccountChanges(refresh);
    const unsubscribeTreasury = subscribeToStoredTreasuryChanges(refresh);
    return () => {
      unsubscribeFinance();
      unsubscribeAccounts();
      unsubscribeTreasury();
    };
  }, []);

  return <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.28)]"><h3 className="text-2xl font-semibold text-white">Kar / Zarar</h3><p className="mt-1 text-sm text-slate-400">Kasa hareketleri, stok maliyeti ve günlük operasyon giderleri üzerinden özet.</p><div className="mt-5 grid gap-4 md:grid-cols-4">{[['Gelir', income, 'text-emerald-200 bg-emerald-500/10'], ['Kasa gideri', treasuryExpense, 'text-rose-200 bg-rose-500/10'], ['Stok maliyeti', stockCost, 'text-amber-200 bg-amber-500/10'], ['Net kar', netProfit, netProfit >= 0 ? 'text-blue-200 bg-blue-500/10' : 'text-rose-200 bg-rose-500/10']].map(([label, value, tone]) => <div key={label as string} className={`rounded-2xl p-5 ${tone}`}><p className="text-sm opacity-75">{label}</p><p className="mt-3 text-2xl font-semibold">{formatTRY(value as number)}</p></div>)}</div><div className="mt-5 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4"><p className="font-semibold text-white">Hesap bakiyeleri</p><div className="mt-3 grid gap-3 md:grid-cols-3">{balances.map((account) => <div key={account.id} className="rounded-xl bg-[#111827] px-4 py-3"><p className="text-sm text-slate-500">{account.name}</p><p className="mt-1 font-semibold text-white">{formatTRY(account.balance)}</p></div>)}</div></div></section>;
}
