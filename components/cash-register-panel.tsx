'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Banknote, Building2, CreditCard } from 'lucide-react';
import { loadStoredAccounts, subscribeToStoredAccountChanges } from '@/lib/account-store';
import {
  loadStoredFinanceAccountTransactions,
  subscribeToFinanceRuntimeChanges,
} from '@/lib/finance-runtime-store';
import {
  type Account,
  type AccountTransaction,
  buildTreasuryMovementsFromAccountTransactions,
  calculateTreasuryBalances,
  createPosTransferMovements,
  erpAccountTransactions,
  erpAccounts,
  formatTRY,
  type TreasuryAccount,
  treasuryAccounts,
  type TreasuryAccountType,
  type TreasuryMovement,
} from '@/lib/erp-engine';
import {
  appendStoredTreasuryMovements,
  loadStoredTreasuryMovements,
  subscribeToStoredTreasuryChanges,
} from '@/lib/treasury-runtime-store';
import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';

function accountIcon(type: TreasuryAccountType) {
  if (type === 'cash') return Banknote;
  if (type === 'bank') return Building2;
  return CreditCard;
}

function accountTone(type: TreasuryAccountType) {
  if (type === 'cash') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20';
  if (type === 'bank') return 'bg-blue-500/15 text-blue-200 border-blue-400/20';
  return 'bg-amber-500/15 text-amber-200 border-amber-400/20';
}

function parseRate(value: string) {
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

const CUSTOM_TREASURY_KEY = 'adisyon-custom-treasury-accounts';

function loadCustomTreasuryAccounts(): TreasuryAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = readRuntimeItem('tenant', CUSTOM_TREASURY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TreasuryAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[business-flow] custom treasury accounts load failed', error);
    return [];
  }
}

function saveCustomTreasuryAccounts(accounts: TreasuryAccount[]) {
  if (typeof window === 'undefined') return;
  writeRuntimeItem('tenant', CUSTOM_TREASURY_KEY, JSON.stringify(accounts));
}

export function CashRegisterPanel() {
  const [commissionRate, setCommissionRate] = useState(String(treasuryAccounts.find((account) => account.type === 'pos')?.commissionRate ?? 2.4));
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const [storedTransactions, setStoredTransactions] = useState<AccountTransaction[]>([]);
  const [storedTreasuryMovements, setStoredTreasuryMovements] = useState<TreasuryMovement[]>([]);
  const [customTreasuryAccounts, setCustomTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [newBankName, setNewBankName] = useState('');
  const [newPosName, setNewPosName] = useState('');
  const [message, setMessage] = useState('');

  const sourceAccounts = useMemo(() => [...erpAccounts, ...storedAccounts], [storedAccounts]);
  const sourceTransactions = useMemo(() => [...erpAccountTransactions, ...storedTransactions], [storedTransactions]);
  const baseMovements = useMemo(
    () => buildTreasuryMovementsFromAccountTransactions(sourceTransactions, sourceAccounts),
    [sourceAccounts, sourceTransactions],
  );
  const movements = useMemo(() => [...baseMovements, ...storedTreasuryMovements], [baseMovements, storedTreasuryMovements]);
  const allTreasuryAccounts = useMemo(() => [...treasuryAccounts, ...customTreasuryAccounts], [customTreasuryAccounts]);
  const balances = useMemo(() => calculateTreasuryBalances(allTreasuryAccounts, movements), [allTreasuryAccounts, movements]);
  const posBalance = balances.find((account) => account.type === 'pos')?.balance ?? 0;
  const rate = parseRate(commissionRate);
  const commission = posBalance * (rate / 100);
  const netTransfer = Math.max(0, posBalance - commission);
  const dailyIncome = movements.filter((movement) => movement.direction === 'in').reduce((sum, movement) => sum + movement.amount, 0);
  const dailyExpense = movements.filter((movement) => movement.direction === 'out').reduce((sum, movement) => sum + movement.amount, 0);

  useEffect(() => {
    const refresh = () => {
      setStoredAccounts(loadStoredAccounts());
      setStoredTransactions(loadStoredFinanceAccountTransactions());
      setStoredTreasuryMovements(loadStoredTreasuryMovements());
      setCustomTreasuryAccounts(loadCustomTreasuryAccounts());
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

  function transferPosToBank() {
    const transferMovements = createPosTransferMovements(posBalance, rate);
    if (transferMovements.length === 0) {
      setMessage('Aktarılacak POS bakiyesi yok.');
      return;
    }

    appendStoredTreasuryMovements(transferMovements);
    setMessage(`${formatTRY(netTransfer)} bankaya aktarıldı. Komisyon: ${formatTRY(commission)}.`);
  }

  function addTreasuryAccount(type: 'bank' | 'pos') {
    const name = (type === 'bank' ? newBankName : newPosName).trim();
    if (!name) {
      setMessage(type === 'bank' ? 'Banka adı girin.' : 'POS adı girin.');
      return;
    }

    const account: TreasuryAccount = {
      id: `${type}-${Date.now()}`,
      name,
      type,
      openingBalance: 0,
      commissionRate: type === 'pos' ? rate : undefined,
    };
    const nextAccounts = [account, ...customTreasuryAccounts];
    setCustomTreasuryAccounts(nextAccounts);
    saveCustomTreasuryAccounts(nextAccounts);
    if (type === 'bank') setNewBankName('');
    if (type === 'pos') setNewPosName('');
    setMessage(`${name} ${type === 'bank' ? 'banka' : 'POS'} hesabı eklendi.`);
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
      <header className="border-b border-white/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Kasa takibi</h2>
            <p className="mt-1 text-sm text-slate-400">Günlük gelir ve giderler nakit kasa, banka ve POS hesabı üzerinden izlenir.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-right sm:min-w-[360px]">
            <div className="rounded-2xl bg-emerald-500/10 px-4 py-3">
              <p className="text-xs text-emerald-200/70">Günlük giriş</p>
              <p className="mt-1 text-lg font-semibold text-emerald-200">{formatTRY(dailyIncome)}</p>
            </div>
            <div className="rounded-2xl bg-rose-500/10 px-4 py-3">
              <p className="text-xs text-rose-200/70">Günlük çıkış</p>
              <p className="mt-1 text-lg font-semibold text-rose-200">{formatTRY(dailyExpense)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3">
          <p className="text-sm font-semibold text-white">Banka hesabı ekle</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={newBankName}
              onChange={(event) => setNewBankName(event.target.value)}
              placeholder="Örn: Ziraat Bankası"
              className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500"
            />
            <button type="button" onClick={() => addTreasuryAccount('bank')} className="h-11 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500">
              Banka ekle
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-white">POS hesabı ekle</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={newPosName}
              onChange={(event) => setNewPosName(event.target.value)}
              placeholder="Örn: Multinet POS / Garanti POS"
              className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500"
            />
            <button type="button" onClick={() => addTreasuryAccount('pos')} className="h-11 rounded-2xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-500">
              POS ekle
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          {balances.map((account) => {
            const Icon = accountIcon(account.type);
            return (
              <article key={account.id} className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${accountTone(account.type)}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-white">{account.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{account.type === 'cash' ? 'Nakit giriş/çıkış' : account.type === 'bank' ? 'Banka hareketleri' : 'Kart tahsilatları'}</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-white">{formatTRY(account.balance)}</p>
                </div>
              </article>
            );
          })}

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <p className="font-semibold text-white">POS komisyon ve aktarım</p>
            <label className="mt-3 block">
              <span className="text-sm text-slate-400">Banka komisyon oranı (%)</span>
              <input value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none focus:border-amber-300/50" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-[#0B1220]/70 p-3"><p className="text-slate-500">Komisyon</p><p className="font-semibold text-amber-200">{formatTRY(commission)}</p></div>
              <div className="rounded-xl bg-[#0B1220]/70 p-3"><p className="text-slate-500">Bankaya net</p><p className="font-semibold text-emerald-200">{formatTRY(netTransfer)}</p></div>
            </div>
            <button type="button" onClick={transferPosToBank} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition hover:bg-blue-500 active:scale-[0.98]">
              <ArrowRightLeft className="h-4 w-4" />
              POS bakiyesini bankaya aktar
            </button>
            {message ? <p className="mt-3 rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-200">{message}</p> : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[0.7fr_1.4fr_0.7fr_0.8fr] bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span>Tarih</span>
            <span>Açıklama</span>
            <span>Yön</span>
            <span>Tutar</span>
          </div>
          <div className="max-h-[430px] divide-y divide-white/10 overflow-y-auto">
            {[...movements].reverse().map((movement) => (
              <div key={movement.id} className="grid grid-cols-[0.7fr_1.4fr_0.7fr_0.8fr] items-center gap-3 bg-[#111827] px-4 py-3 text-sm hover:bg-[#172033]">
                <span className="text-slate-400">{movement.date}</span>
                <span>
                  <span className="block font-semibold text-white">{movement.description}</span>
                  <span className="mt-1 block text-xs text-slate-500">{balances.find((account) => account.id === movement.accountId)?.name}</span>
                </span>
                <span className={movement.direction === 'in' ? 'font-semibold text-emerald-200' : 'font-semibold text-rose-200'}>{movement.direction === 'in' ? 'Giriş' : 'Çıkış'}</span>
                <span className="font-semibold text-white">{formatTRY(movement.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
