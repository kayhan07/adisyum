'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, FileText, ReceiptText, Search, UserRound, UsersRound } from 'lucide-react';
import {
  appendStoredAccount,
  loadStoredAccounts,
  subscribeToStoredAccountChanges,
} from '@/lib/account-store';
import { appendStoredFinanceAccountTransaction, buildFinanceTransaction, loadStoredFinanceAccountTransactions, subscribeToFinanceRuntimeChanges } from '@/lib/finance-runtime-store';
import { getStoredOrdersByTable, subscribeToStoredOrdersChanges } from '@/lib/table-payment-state';
import {
  calculateAccountBalances,
  erpAccountTransactions,
  erpAccounts,
  formatQuantity,
  formatTRY,
  getIngredient,
  isAccountDebtTransaction,
  requiresManagerApprovalForCustomerCharge,
  type Account,
  type AccountTransaction,
  type AccountType,
} from '@/lib/erp-engine';
import { useSeedBusinessDataEnabled } from '@/lib/tenant-clean-start';

type AccountWithBalance = Account & { balance: number };
type ViewMode = 'list' | 'detail' | 'new';
type AccountForm = {
  type: AccountType;
  name: string;
  phone: string;
  address: string;
  invoiceTitle: string;
  taxOffice: string;
  taxNumber: string;
  creditLimit: string;
  salary: string;
};

const emptyForm: AccountForm = {
  type: 'customer',
  name: '',
  phone: '',
  address: '',
  invoiceTitle: '',
  taxOffice: '',
  taxNumber: '',
  creditLimit: '1000',
  salary: '28500',
};

const typePrefix: Record<AccountType, string> = {
  customer: 'CR',
  supplier: 'TD',
  partner: 'OR',
  staff: 'PR',
};

function accountTypeText(type: AccountType) {
  if (type === 'customer') return 'Müşteri';
  if (type === 'supplier') return 'Tedarikçi';
  if (type === 'partner') return 'Ortak';
  return 'Personel';
}

function movementTypeText(type: AccountTransaction['type']) {
  if (type === 'customer_charge') return 'Veresiye adisyon';
  if (type === 'customer_payment') return 'Tahsilat';
  if (type === 'supplier_invoice') return 'Alış faturası';
  if (type === 'supplier_payment') return 'Ödeme';
  if (type === 'partner_charge') return 'Ortak hareketi';
  if (type === 'partner_payment') return 'Ortak ödemesi';
  if (type === 'staff_charge') return 'Personel borcu';
  return 'Personel ödemesi';
}

function canOpenDetail(transaction: AccountTransaction) {
  if (transaction.type === 'supplier_invoice') return true;
  return transaction.type === 'customer_charge' && transaction.description.toLocaleLowerCase('tr-TR').includes('adisyon');
}

function buildMovementRows(account: AccountWithBalance, transactions: AccountTransaction[]) {
  return transactions.reduce<Array<AccountTransaction & { balance: number }>>((rows, transaction) => {
    const previousBalance = rows.at(-1)?.balance ?? account.openingBalance;
    const nextBalance = previousBalance + (isAccountDebtTransaction(transaction.type) ? transaction.amount : -transaction.amount);
    rows.push({ ...transaction, balance: nextBalance });
    return rows;
  }, []);
}

function parseCurrencyInput(value: string) {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function AccountIcon({ type }: { type: AccountType }) {
  const Icon = type === 'customer' ? UserRound : type === 'supplier' ? Building2 : UsersRound;
  const tone = type === 'customer' ? 'bg-blue-500/15 text-blue-200' : type === 'supplier' ? 'bg-amber-500/15 text-amber-200' : type === 'partner' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-violet-500/15 text-violet-200';
  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function AccountWorkspace() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [localAccounts, setLocalAccounts] = useState<Account[]>([]);
  const [storedTransactions, setStoredTransactions] = useState<AccountTransaction[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [selectedAdisyonIds, setSelectedAdisyonIds] = useState<string[]>([]);
  const [accountDiscountInput, setAccountDiscountInput] = useState('');
  const [accountActionMessage, setAccountActionMessage] = useState('');

  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);
  const seedTransactions = useMemo(() => includeSeedData ? erpAccountTransactions : [], [includeSeedData]);
  const sourceAccounts = useMemo(() => [...seedAccounts, ...localAccounts], [seedAccounts, localAccounts]);
  const sourceTransactions = useMemo(() => [...seedTransactions, ...storedTransactions], [seedTransactions, storedTransactions]);
  const balances = useMemo(() => calculateAccountBalances(sourceAccounts, sourceTransactions), [sourceAccounts, sourceTransactions]);
  const selectedAccount = selectedAccountId ? balances.find((account) => account.id === selectedAccountId) ?? null : null;

  useEffect(() => {
    const refresh = () => {
      setLocalAccounts(loadStoredAccounts());
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

  const accounts = balances.filter((account) => {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return true;
    return `${account.name} ${account.code} ${account.phone}`.toLocaleLowerCase('tr-TR').includes(needle);
  });

  const selectedTransactions = selectedAccount
    ? sourceTransactions.filter((transaction) => transaction.accountId === selectedAccount.id)
    : [];
  const movementRows = selectedAccount ? buildMovementRows(selectedAccount, selectedTransactions).reverse() : [];
  const selectedMovement = movementRows.find((movement) => movement.id === selectedMovementId) ?? null;
  const creditLimitUsed = selectedAccount?.type === 'customer' && selectedAccount.creditLimit ? (selectedAccount.balance / selectedAccount.creditLimit) * 100 : 0;
  const customerLimitExceeded = selectedAccount?.type === 'customer' && typeof selectedAccount.creditLimit === 'number' && selectedAccount.balance >= selectedAccount.creditLimit;
  const managerApprovalNeeded = selectedAccount ? requiresManagerApprovalForCustomerCharge(selectedAccount, selectedAccount.balance, 1) : false;
  const customerAdisyonMovements = selectedAccount
    ? movementRows.filter((movement) => movement.type === 'customer_charge' && movement.description.toLocaleLowerCase('tr-TR').includes('adisyon'))
    : [];
  const selectedAdisyonTotal = customerAdisyonMovements
    .filter((movement) => selectedAdisyonIds.includes(movement.id))
    .reduce((sum, movement) => sum + movement.amount, 0);

  function openAccount(account: AccountWithBalance) {
    setSelectedAccountId(account.id);
    setSelectedMovementId(null);
    setViewMode('detail');
  }

  function backToList() {
    setViewMode('list');
    setSelectedAccountId(null);
    setSelectedMovementId(null);
    setSelectedAdisyonIds([]);
  }

  function openNewForm() {
    setForm(emptyForm);
    setFormError('');
    setViewMode('new');
  }

  function toggleAdisyonSelection(id: string) {
    setSelectedAdisyonIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function printSelectedAdisyons() {
    if (selectedAdisyonIds.length === 0) {
      setAccountActionMessage('Yazdırılacak adisyon seçin.');
      return;
    }
    setAccountActionMessage(`${selectedAdisyonIds.length} cari adisyon toplu yazdırma kuyruğuna alındı.`);
  }

  function applyCustomerDiscount() {
    if (!selectedAccount || selectedAdisyonIds.length === 0) {
      setAccountActionMessage('İskonto için cari adisyon seçin.');
      return;
    }
    const discountAmount = Math.min(parseCurrencyInput(accountDiscountInput), selectedAdisyonTotal);
    if (discountAmount <= 0) {
      setAccountActionMessage('Geçerli iskonto tutarı girin.');
      return;
    }

    appendStoredFinanceAccountTransaction(
      buildFinanceTransaction({
        accountId: selectedAccount.id,
        type: 'customer_payment',
        amount: discountAmount,
        description: `Cari müşteri iskonto mahsupu (${selectedAdisyonIds.length} adisyon)`,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
    setAccountDiscountInput('');
    setSelectedAdisyonIds([]);
    setAccountActionMessage(`${formatTRY(discountAmount)} cari iskonto mahsup edildi.`);
  }

  function saveAccount() {
    if (!form.name.trim()) {
      setFormError('Cari adı zorunlu.');
      return;
    }

    const sameTypeCount = sourceAccounts.filter((account) => account.type === form.type).length + 1;
    const code = `${typePrefix[form.type]}-${String(sameTypeCount).padStart(3, '0')}`;
    const account: Account = {
      id: `local-${form.type}-${Date.now()}`,
      code,
      name: form.name.trim(),
      type: form.type,
      openingBalance: 0,
      phone: form.phone.trim() || '-',
      address: form.address.trim() || '-',
      invoiceTitle: form.invoiceTitle.trim() || form.name.trim(),
      taxOffice: form.taxOffice.trim() || '-',
      taxNumber: form.taxNumber.trim() || '-',
      creditLimit: form.type === 'customer' ? parseCurrencyInput(form.creditLimit) : undefined,
    };

    appendStoredAccount(account);
    setSelectedAccountId(account.id);
    setSelectedMovementId(null);
    setViewMode('detail');
  }

  if (viewMode === 'new') {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <header className="border-b border-white/10 p-5">
          <button type="button" onClick={backToList} className="mb-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-300 transition hover:bg-[#172033] hover:text-white active:scale-[0.98]">
            <ArrowLeft className="h-4 w-4" />
            Cari listesine dön
          </button>
          <h2 className="text-3xl font-semibold tracking-tight text-white">Yeni cari kart</h2>
          <p className="mt-2 text-sm text-slate-400">Müşteri, tedarikçi, ortak veya personel carisi oluşturun. Kart bilgileri cari detayında görünür.</p>
        </header>

        <div className="grid gap-5 p-5 xl:grid-cols-[0.75fr_1.25fr]">
          <aside className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
            <p className="text-sm font-semibold text-white">Cari türü</p>
            <div className="mt-4 grid gap-2">
              {(['customer', 'supplier', 'partner', 'staff'] as AccountType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, type }))}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${form.type === type ? 'border-blue-400/50 bg-blue-500/15 text-white' : 'border-white/10 bg-[#111827] text-slate-300 hover:bg-[#172033]'}`}
                >
                  <AccountIcon type={type} />
                  <span className="font-semibold">{accountTypeText(type)}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-400">Cari adı</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-400">Telefon</span>
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-400">Fatura unvanı</span>
                <input value={form.invoiceTitle} onChange={(event) => setForm((current) => ({ ...current, invoiceTitle: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-slate-400">Adres</span>
                <textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#111827] px-4 py-3 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-400">Vergi dairesi</span>
                <input value={form.taxOffice} onChange={(event) => setForm((current) => ({ ...current, taxOffice: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              <label className="block">
                <span className="text-sm text-slate-400">Vergi / TC no</span>
                <input value={form.taxNumber} onChange={(event) => setForm((current) => ({ ...current, taxNumber: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
              </label>
              {form.type === 'customer' ? (
                <label className="block md:col-span-2">
                  <span className="text-sm text-slate-400">Cari kredi limiti</span>
                  <input value={form.creditLimit} onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
                  <p className="mt-2 text-sm text-amber-200">Limit aşımı olursa cari işlem kasiyer tarafından değil, yönetici onayıyla işlenir.</p>
                </label>
              ) : null}
              {form.type === 'staff' ? (
                <label className="block md:col-span-2">
                  <span className="text-sm text-slate-400">Aylık maaş</span>
                  <input value={form.salary} onChange={(event) => setForm((current) => ({ ...current, salary: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-blue-400/50" />
                  <p className="mt-2 text-sm text-violet-200">Personel carisinde maaş tahakkuku, avans ve mahsup hareketleri takip edilir.</p>
                </label>
              ) : null}
            </div>

            {formError ? <p className="mt-4 rounded-2xl bg-rose-500/12 px-4 py-3 text-sm font-semibold text-rose-200">{formError}</p> : null}
            <button type="button" onClick={saveAccount} className="mt-5 h-14 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.28)] transition hover:bg-blue-500 active:scale-[0.98]">
              Cari kartı oluştur
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!selectedAccount) {
    return (
      <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Cari hesaplar</h2>
              <p className="mt-1 text-sm text-slate-400">Müşteri, tedarikçi, ortak ve personel carileri. Cari adına tıklayınca sadece o carinin hareketleri açılır.</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="flex h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm text-slate-400 md:w-[300px]">
                <Search className="h-4 w-4" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari ara" className="h-full min-w-0 flex-1 bg-transparent font-medium text-white outline-none placeholder:text-slate-600" />
              </label>
              <button type="button" onClick={openNewForm} className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition hover:bg-blue-500 active:scale-[0.98]">
                Yeni cari oluştur
              </button>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1fr_0.45fr_0.55fr_0.45fr_2.5rem] bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Cari</span>
              <span>Tür</span>
              <span>Telefon</span>
              <span>Bakiye</span>
              <span />
            </div>
            <div className="divide-y divide-white/10">
              {accounts.map((account) => {
                const limitExceeded = account.type === 'customer' && typeof account.creditLimit === 'number' && account.balance >= account.creditLimit;
                return (
                  <button key={account.id} type="button" onClick={() => openAccount(account)} className="grid w-full grid-cols-[1fr_0.45fr_0.55fr_0.45fr_2.5rem] items-center gap-4 bg-[#111827] px-4 py-4 text-left transition hover:bg-[#172033] active:scale-[0.995]">
                    <span className="flex min-w-0 items-center gap-3">
                      <AccountIcon type={account.type} />
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-white">{account.name}</span>
                        <span className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                          {account.code}
                          {limitExceeded ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">Limit dolu</span> : null}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-slate-300">{accountTypeText(account.type)}</span>
                    <span className="text-sm text-slate-400">{account.phone}</span>
                    <span className="text-base font-semibold text-white">{formatTRY(account.balance)}</span>
                    <span className="flex justify-end text-slate-500"><ChevronRight className="h-5 w-5" /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
      <header className="border-b border-white/10 p-5">
        <button type="button" onClick={() => { setViewMode('list'); setSelectedAccountId(null); setSelectedMovementId(null); }} className="mb-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-300 transition hover:bg-[#172033] hover:text-white active:scale-[0.98]">
          <ArrowLeft className="h-4 w-4" />
          Cari listesine dön
        </button>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <AccountIcon type={selectedAccount.type} />
            <div>
              <p className="text-sm font-semibold text-blue-300">{accountTypeText(selectedAccount.type)}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white">{selectedAccount.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedAccount.code}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-[#0B1220] px-6 py-4 text-right">
            <p className="text-sm text-slate-500">Bakiye</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-white">{formatTRY(selectedAccount.balance)}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="p-4 xl:border-r xl:border-white/10">
          <div className="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4 md:grid-cols-2">
            <Info label="Telefon" value={selectedAccount.phone} />
            <Info label="Adres" value={selectedAccount.address} />
            <Info label="Fatura unvanı" value={selectedAccount.invoiceTitle} />
            <Info label="Vergi bilgisi" value={`${selectedAccount.taxOffice} · ${selectedAccount.taxNumber}`} />
          </div>

          {selectedAccount.type === 'staff' && typeof selectedAccount.salary === 'number' ? (
            <div className="mb-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Personel maaşı</p>
                  <p className="mt-1 text-sm text-slate-300">Aylık maaş: {formatTRY(selectedAccount.salary)}</p>
                </div>
                <p className="text-lg font-semibold text-violet-200">Kalan {formatTRY(selectedAccount.balance)}</p>
              </div>
              <p className="mt-3 text-sm text-violet-200">Avans ve mahsup hareketleri cari hareketlerde maaş bakiyesinden düşer.</p>
            </div>
          ) : null}
          {selectedAccount.type === 'customer' && typeof selectedAccount.creditLimit === 'number' ? (
            <div className={`mb-4 rounded-2xl border p-4 ${customerLimitExceeded ? 'border-rose-400/25 bg-rose-500/12' : 'border-amber-400/20 bg-amber-500/10'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Cari kredi limiti</p>
                  <p className="mt-1 text-sm text-slate-300">Limit: {formatTRY(selectedAccount.creditLimit)} · Kullanım: %{Math.min(999, Math.round(creditLimitUsed))}</p>
                </div>
                <p className={`text-lg font-semibold ${customerLimitExceeded ? 'text-rose-200' : 'text-amber-200'}`}>{customerLimitExceeded ? 'Limit doldu' : 'Takipte'}</p>
              </div>
              {managerApprovalNeeded ? <p className="mt-3 text-sm font-semibold text-rose-200">Limit aşımı işleminde kasiyer işlem yapamaz; cariye işleme yönetici onayı gerekir.</p> : null}
            </div>
          ) : null}

          {selectedAccount.type === 'customer' ? (
            <div className="mb-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-semibold text-white">Cari adisyon seçimi</p>
                  <p className="mt-1 text-sm text-slate-300">Müşteri adisyonlarını seç, toplu yazdır veya cari iskonto mahsubu uygula.</p>
                </div>
                <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200">
                  Seçili {selectedAdisyonIds.length} · {formatTRY(selectedAdisyonTotal)}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {customerAdisyonMovements.length > 0 ? customerAdisyonMovements.map((movement) => (
                  <label key={`adisyon-select-${movement.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{movement.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{movement.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-blue-200">{formatTRY(movement.amount)}</span>
                      <input
                        type="checkbox"
                        checked={selectedAdisyonIds.includes(movement.id)}
                        onChange={() => toggleAdisyonSelection(movement.id)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                    </div>
                  </label>
                )) : (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-400">Bu caride adisyon hareketi yok.</p>
                )}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input
                  value={accountDiscountInput}
                  onChange={(event) => setAccountDiscountInput(event.target.value)}
                  placeholder="Cari iskonto tutarı"
                  className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none placeholder:text-slate-500"
                />
                <button type="button" onClick={applyCustomerDiscount} className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">İskonto uygula</button>
                <button type="button" onClick={printSelectedAdisyons} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">Toplu yazdır</button>
              </div>
              {accountActionMessage ? <p className="mt-3 rounded-xl bg-white/8 px-3 py-2 text-sm font-semibold text-blue-100">{accountActionMessage}</p> : null}
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">Cari hareketler</h3>
            <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-300">{movementRows.length} hareket</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[0.7fr_1.45fr_0.75fr_0.75fr_2.5rem] bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Tarih</span><span>Hareket</span><span>Tutar</span><span>Bakiye</span><span />
            </div>
            <div className="divide-y divide-white/10">
              {movementRows.map((movement) => {
                const debt = isAccountDebtTransaction(movement.type);
                const openable = canOpenDetail(movement);
                const active = movement.id === selectedMovementId;
                return (
                  <button key={movement.id} type="button" onClick={() => setSelectedMovementId(openable ? movement.id : null)} disabled={!openable} className={`grid w-full grid-cols-[0.7fr_1.45fr_0.75fr_0.75fr_2.5rem] items-center gap-3 px-4 py-4 text-left transition ${active ? 'bg-blue-500/12' : 'bg-[#111827]'} ${openable ? 'hover:bg-[#172033] active:scale-[0.995]' : 'cursor-default opacity-85'}`}>
                    <span className="text-sm text-slate-400">{movement.date}</span>
                    <span><span className="block font-semibold text-white">{movement.description}</span><span className="mt-1 block text-xs text-slate-500">{movementTypeText(movement.type)}</span></span>
                    <span className={`font-semibold ${debt ? 'text-amber-200' : 'text-emerald-200'}`}>{debt ? '+' : '-'} {formatTRY(movement.amount)}</span>
                    <span className="font-semibold text-white">{formatTRY(movement.balance)}</span>
                    <span className="flex justify-end text-slate-500">{openable ? <ChevronRight className="h-5 w-5" /> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="border-t border-white/10 bg-[#0B1220]/45 p-4 xl:border-t-0">
          {!selectedMovement ? (
            <div className="rounded-2xl border border-white/10 bg-[#111827] p-5 text-slate-400">
              <FileText className="h-8 w-8 text-slate-500" />
              <p className="mt-4 font-semibold text-white">Hareket detayı</p>
              <p className="mt-2 text-sm leading-6">Veresiye adisyonu veya alış faturası satırına tıklayın. Detay burada açılır.</p>
            </div>
          ) : selectedMovement.type === 'supplier_invoice' ? (
            <InvoiceDetail selectedMovement={selectedMovement} />
          ) : (
            <OrderDetail />
          )}
        </aside>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>;
}

function InvoiceDetail({ selectedMovement }: { selectedMovement: AccountTransaction }) {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-[#111827] p-5">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-200"><ReceiptText className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-amber-200">Fatura detayı</p><h4 className="text-lg font-semibold text-white">{selectedMovement.description}</h4></div></div>
      <div className="mt-5 space-y-2">
        {[{ ingredientId: 'supplier-invoice', quantity: 1, unitPrice: selectedMovement.amount }].map((line) => {
          const ingredient = getIngredient(line.ingredientId);
          return <div key={line.ingredientId} className="rounded-2xl bg-[#0B1220] px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-white">{line.ingredientId === 'supplier-invoice' ? selectedMovement.description : ingredient?.name ?? line.ingredientId}</p><p className="font-semibold text-amber-200">{formatTRY(line.quantity * line.unitPrice)}</p></div><p className="mt-1 text-sm text-slate-500">{line.ingredientId === 'supplier-invoice' ? 'Fatura toplamı' : `${ingredient ? formatQuantity(line.quantity, ingredient.unit) : line.quantity} × ${formatTRY(line.unitPrice)}`}</p></div>;
        })}
      </div>
    </div>
  );
}

function OrderDetail() {
  const [orderLines, setOrderLines] = useState<Array<{ id: string; name: string; qty: number; price: number; note?: string }>>([]);

  useEffect(() => {
    const refresh = () => {
      const ordersByTable = getStoredOrdersByTable<unknown>();
      const lines = Object.values(ordersByTable)
        .flatMap((tableOrders) => tableOrders)
        .filter((item): item is { id: string; name: string; qty: number; price: number; note?: string } => {
          if (!item || typeof item !== 'object') return false;
          const candidate = item as Record<string, unknown>;
          return typeof candidate.id === 'string'
            && typeof candidate.name === 'string'
            && typeof candidate.qty === 'number'
            && typeof candidate.price === 'number';
        });
      setOrderLines(lines.slice(0, 12));
    };

    refresh();
    const unsubscribe = subscribeToStoredOrdersChanges(refresh);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-[#111827] p-5">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200"><ReceiptText className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-blue-200">Adisyon detayı</p><h4 className="text-lg font-semibold text-white">Merkez Salon 02</h4></div></div>
      <div className="mt-5 space-y-2">
        {orderLines.length === 0 ? (
          <p className="rounded-2xl bg-[#0B1220] px-4 py-3 text-sm text-slate-400">Canlı adisyon satırı bulunamadı.</p>
        ) : orderLines.map((item) => <div key={item.id} className="rounded-2xl bg-[#0B1220] px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-white">{item.name}</p><p className="font-semibold text-blue-200">{formatTRY(item.qty * item.price * 1.1)}</p></div><p className="mt-1 text-sm text-slate-500">{item.qty} adet × {formatTRY(item.price * 1.1)}{item.note ? ` · ${item.note}` : ''}</p></div>)}
      </div>
    </div>
  );
}
