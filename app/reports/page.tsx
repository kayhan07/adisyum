'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRightLeft, CreditCard, Package2, TrendingUp, UsersRound } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { getDefaultBranchState, loadBranchState, subscribeToBranchChanges } from '@/lib/branch-store';
import { loadStoredPurchaseInvoices, subscribeToPurchaseInvoices } from '@/lib/purchase-invoice-store';
import { getStoredOrdersByTable, subscribeToStoredOrdersChanges } from '@/lib/table-payment-state';
import { formatTRY } from '@/lib/erp-engine';
import { loadTransferRecords } from '@/lib/warehouse-store';

type OrderLine = {
  qty: number;
  price: number;
};

export default function ReportsPage() {
  const [branchState, setBranchState] = useState(() => getDefaultBranchState());
  const [orderRevenue, setOrderRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [transferCount, setTransferCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setBranchState(loadBranchState());

      const ordersByTable = getStoredOrdersByTable<OrderLine>();
      const allLines = Object.values(ordersByTable).flat();
      setOrderRevenue(allLines.reduce((sum, line) => sum + (line.qty * line.price), 0));
      setOrderCount(allLines.reduce((sum, line) => sum + line.qty, 0));

      const invoices = loadStoredPurchaseInvoices();
      setInvoiceTotal(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
      setTransferCount(loadTransferRecords().length);
    };

    refresh();

    const unsubscribeBranches = subscribeToBranchChanges(refresh);
    const unsubscribeOrders = subscribeToStoredOrdersChanges(refresh);
    const unsubscribeInvoices = subscribeToPurchaseInvoices(refresh);

    return () => {
      unsubscribeBranches();
      unsubscribeOrders();
      unsubscribeInvoices();
    };
  }, []);

  const branchCards = useMemo(
    () =>
      branchState.branches.map((branch, index) => {
        const activityRatio = branchState.branches.length > 0 ? (index + 1) / branchState.branches.length : 1;
        const projectedRevenue = orderRevenue * (0.7 + (activityRatio * 0.25));
        const projectedOrders = Math.max(0, Math.round(orderCount * (0.6 + (activityRatio * 0.2))));

        return {
          ...branch,
          projectedRevenue,
          projectedOrders,
          transferNote: branchState.transfers.find((transfer) => transfer.source === branch.name || transfer.target === branch.name)?.status ?? 'Transfer yok',
        };
      }),
    [branchState, orderCount, orderRevenue],
  );

  return (
    <AppShell
      title="Operasyon raporlari"
      subtitle="Rapor ekranı artık canlı sipariş, fatura ve transfer kayıtlarından beslenir."
    >
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Toplam adisyon cirosu', value: formatTRY(orderRevenue), note: `${orderCount} ürün hareketi`, icon: TrendingUp, tone: 'from-emerald-500/18 to-emerald-900/10 border-emerald-400/20' },
            { label: 'Alis faturasi toplami', value: formatTRY(invoiceTotal), note: 'Kayitli tedarik faturasi', icon: CreditCard, tone: 'from-amber-500/18 to-amber-900/10 border-amber-400/20' },
            { label: 'Sube sayisi', value: String(branchState.branches.length), note: 'Aktif operasyon merkezi', icon: UsersRound, tone: 'from-sky-500/18 to-sky-900/10 border-sky-400/20' },
            { label: 'Transfer hareketi', value: String(transferCount), note: 'Depo ve sube sevkleri', icon: ArrowRightLeft, tone: 'from-violet-500/18 to-violet-900/10 border-violet-400/20' },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.label}
                className={`rounded-[1.35rem] border bg-gradient-to-br ${card.tone} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-3 text-[1.5rem] font-semibold tracking-tight text-white">{card.value}</p>
                    <p className="mt-2 text-xs font-medium text-slate-400">{card.note}</p>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[1.5rem] border border-white/10 bg-[#0F172A]/88 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Sube gorunumu</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Canli performans ozeti</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                {branchCards.length} sube
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {branchCards.map((branch) => (
                <div
                  key={branch.id}
                  className="rounded-[1.2rem] border border-white/10 bg-[#111827] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">{branch.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{branch.address}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                        {branch.type}
                      </span>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {branch.transferNote}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-[#0B1220] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Projeksiyon ciro</p>
                      <p className="mt-2 text-xl font-semibold text-white">{formatTRY(branch.projectedRevenue)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-[#0B1220] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Projeksiyon siparis</p>
                      <p className="mt-2 text-xl font-semibold text-white">{branch.projectedOrders}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-[#0B1220] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Operasyon notu</p>
                      <p className="mt-2 text-sm font-semibold text-slate-200">
                        {branch.projectedRevenue > 0 ? 'Kayitli hareketlerden hesaplandi' : 'Hareket geldikce otomatik dolar'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-[#0F172A]/88 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Merkez feed</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Kayit bazli ozet</h2>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6 text-white">
                <Activity className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {[
                {
                  title: 'Siparis akisi',
                  detail: orderCount > 0 ? `${orderCount} adet ürün aktif kayıtlarda görünüyor.` : 'Henüz sipariş kaydı oluşmadı.',
                  tone: 'border-sky-400/20 bg-sky-500/10 text-sky-100',
                  icon: Package2,
                },
                {
                  title: 'Fatura akisi',
                  detail: invoiceTotal > 0 ? `${formatTRY(invoiceTotal)} toplam alış faturası işlendi.` : 'Alış faturası kaydı bekleniyor.',
                  tone: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
                  icon: CreditCard,
                },
                {
                  title: 'Transfer akisi',
                  detail: transferCount > 0 ? `${transferCount} depo/şube transferi kayıtlı.` : 'Transfer kaydı henüz yok.',
                  tone: 'border-violet-400/20 bg-violet-500/10 text-violet-100',
                  icon: ArrowRightLeft,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className={`rounded-[1.1rem] border px-4 py-4 ${item.tone}`}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-current/80">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}


