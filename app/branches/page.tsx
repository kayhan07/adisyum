'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { getDefaultBranchState, loadBranchState, subscribeToBranchChanges } from '@/lib/branch-store';
import { getStoredOrdersByTable } from '@/lib/table-payment-state';
import { getDefaultSessionState, loadSessionState } from '@/lib/session-store';
import { loadTransferRecords } from '@/lib/warehouse-store';

type OrderLine = { qty: number; price: number };

export default function BranchesPage() {
  const [branchState, setBranchState] = useState(() => getDefaultBranchState());
  const [session, setSession] = useState(() => getDefaultSessionState());
  const [runtimeTransferCount, setRuntimeTransferCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setBranchState(loadBranchState());
      setSession(loadSessionState());
      setRuntimeTransferCount(loadTransferRecords().length);
      const ordersByTable = getStoredOrdersByTable<OrderLine>();
      setTotalRevenue(
        Object.values(ordersByTable).flat().reduce((sum, line) => sum + (line.qty * line.price), 0),
      );
    };
    refresh();
    const unsubscribe = subscribeToBranchChanges(refresh);
    return () => unsubscribe();
  }, []);

  return (
    <AppShell
      title="Şube çalışma alanları"
      subtitle="Her şube kendi operasyon bilgisiyle görünür. Merkez ekip zinciri yönetirken şube ekipleri kendi alanını takip eder."
      actions={<button type="button" onClick={() => document.getElementById('sube-listesi')?.scrollIntoView({ behavior: 'smooth' })} className="app-button-primary rounded-full px-5 py-3 text-sm font-semibold">Şube Listesine Git</button>}
    >
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ['Toplam şube', `${branchState.branches.length}`],
            ['Merkezi izlenen ciro', new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalRevenue)],
            ['Bekleyen transfer', `${branchState.transfers.filter((item) => item.status !== 'Tamamlandı').length + runtimeTransferCount}`],
          ].map(([label, value]) => (
            <article key={label} className="app-card branch-card rounded-[1.5rem] border border-line bg-panelElevated/85 p-5 shadow-soft">
              <p className="branch-label text-sm font-medium">{label}</p>
              <p className="branch-value mt-3 text-3xl font-semibold tracking-tight">{value}</p>
            </article>
          ))}
        </section>

        <section id="sube-listesi" className="app-panel rounded-[1.7rem] border border-line bg-panelElevated/85 p-5 shadow-soft scroll-mt-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="branch-label text-xs font-semibold uppercase tracking-[0.22em]">Şube listesi</p>
              <h2 className="branch-title mt-2 text-2xl font-semibold tracking-tight">Her şube ayrı operasyon alanı</h2>
            </div>
            <span className="branch-pill rounded-full border border-line px-3 py-1 text-xs font-semibold">{session.currentUser.branch} aktif görünüm</span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {branchState.branches.map((branch) => (
              <article key={branch.id} className="app-card branch-card rounded-[1.5rem] border border-line bg-canvas/70 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="branch-title text-lg font-semibold">{branch.name}</p>
                    <p className="branch-label mt-1 text-sm">{branch.address}</p>
                  </div>
                  <span className="branch-accent-pill rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold">{branch.type}</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="branch-metric rounded-2xl border border-line bg-panelElevated/70 px-3 py-3">
                    <p>Şube kodu</p>
                    <strong>{branch.id.toUpperCase()}</strong>
                  </div>
                  <div className="branch-metric rounded-2xl border border-line bg-panelElevated/70 px-3 py-3">
                    <p>Transfer</p>
                    <strong>{branchState.transfers.filter((item) => item.source === branch.name || item.target === branch.name).length}</strong>
                  </div>
                  <div className="branch-metric rounded-2xl border border-line bg-panelElevated/70 px-3 py-3">
                    <p>Yetki görünümü</p>
                    <strong>{session.currentUser.role}</strong>
                  </div>
                  <div className="branch-metric rounded-2xl border border-line bg-panelElevated/70 px-3 py-3">
                    <p>Durum</p>
                    <strong>Aktif</strong>
                  </div>
                </div>

                <div className="branch-note mt-4 rounded-[1.1rem] border border-line bg-panelElevated/70 px-4 py-3 text-sm">
                  Şube ekranı kayıt mantığıyla çalışıyor ve merkez oturumu ile izleniyor.
                </div>

                <div className="mt-4 flex gap-3">
                  <Link href="/overview" className="branch-primary-action flex-1 rounded-[1.1rem] bg-accent px-4 py-3 text-center text-sm font-semibold text-white">
                    Görünümü aç
                  </Link>
                  <Link href="/reports" className="branch-secondary-action rounded-[1.1rem] border border-line px-4 py-3 text-sm font-semibold">Detay</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="app-panel rounded-[1.7rem] border border-line bg-panelElevated/85 p-5 shadow-soft">
          <p className="branch-label text-xs font-semibold uppercase tracking-[0.22em]">Şubeler arası transfer</p>
          <div className="mt-4 space-y-3">
            {branchState.transfers.map((transfer) => (
              <div key={transfer.id} className="app-card branch-card rounded-[1.3rem] border border-line bg-canvas/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="branch-title font-semibold">{transfer.id}</p>
                    <p className="branch-label mt-1 text-sm">{transfer.source} → {transfer.target}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="branch-title text-sm font-semibold">{transfer.item} · {transfer.quantity}</p>
                    <span className="branch-accent-pill rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold">{transfer.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
