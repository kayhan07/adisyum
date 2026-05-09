'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Copy, ExternalLink, QrCode, Receipt, ScanLine, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { loadTableLayoutState, subscribeToTableLayoutChanges, type StoredFloorTable } from '@/lib/table-layout-store';
import {
  approvePendingQrOrder,
  buildTableQrUrl,
  getAppOrigin,
  getQrCodeImageUrl,
  rejectPendingQrOrder,
  getTableQrStatus,
  getWaiterCallTableIds,
  setTableWaiterRequested,
  subscribeToQrMenuChanges,
} from '@/lib/qr-menu-state';
import {
  getPaymentRequestedTableIds,
  setTablePaymentRequested,
  subscribeToPaymentRequestedChanges,
} from '@/lib/table-payment-state';

type AdminTableCard = {
  id: string;
  name: string;
  total: number;
  waiterRequestedAt: string | null;
  billRequested: boolean;
  pendingOrderCount: number;
  pendingOrderIds: string[];
  url: string;
  qrImageUrl: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return '';
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));

  if (diffMin < 60) {
    return `${diffMin} dk önce`;
  }

  const hours = Math.round(diffMin / 60);
  return `${hours} sa önce`;
}

export function QrAdmin() {
  const [origin, setOrigin] = useState('');
  const [tables, setTables] = useState<StoredFloorTable[]>([]);
  const [rows, setRows] = useState<AdminTableCard[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const refreshTables = () => {
      setTables(loadTableLayoutState().tables);
    };

    refreshTables();
    const unsubscribeTables = subscribeToTableLayoutChanges(refreshTables);
    return () => {
      unsubscribeTables();
    };
  }, []);

  useEffect(() => {
    setOrigin(getAppOrigin());
  }, []);

  useEffect(() => {
    const refresh = () => {
      const nextOrigin = getAppOrigin();
      setOrigin(nextOrigin);
      setRows(
        tables.map((table) => {
          const status = getTableQrStatus(table.id);
          const url = buildTableQrUrl(table.id, nextOrigin);

          return {
            id: table.id,
            name: table.name,
            total: status.total,
            waiterRequestedAt: status.waiterRequestedAt,
            billRequested: status.billRequested,
            pendingOrderCount: status.pendingOrders.length,
            pendingOrderIds: status.pendingOrders.map((order) => order.id),
            url,
            qrImageUrl: getQrCodeImageUrl(url, 180),
          };
        }),
      );
    };

    refresh();

    const unsubQr = subscribeToQrMenuChanges(refresh);
    const unsubTable = subscribeToPaymentRequestedChanges(refresh);

    return () => {
      unsubQr();
      unsubTable();
    };
  }, [tables]);

  const waiterCount = useMemo(
    () => Object.keys(getWaiterCallTableIds()).length,
    [rows],
  );

  const billCount = useMemo(
    () => getPaymentRequestedTableIds().length,
    [rows],
  );

  const activeTableCount = useMemo(
    () => rows.filter((row) => row.total > 0).length,
    [rows],
  );

  async function copyUrl(row: AdminTableCard) {
    try {
      await navigator.clipboard.writeText(row.url);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId((current) => (current === row.id ? null : current)), 1800);
    } catch {
      window.prompt('Bağlantıyı kopyala', row.url);
    }
  }

  return (
    <AppShell
      title="QR Menü"
      subtitle="Masa bazlı müşteri menüsü, QR bağlantısı ve çağrı yönetimi."
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.4rem] border border-white/10 bg-[#111827] p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ScanLine className="h-4 w-4 text-sky-300" />
            Aktif QR masa
          </div>
          <p className="mt-2 text-3xl font-semibold text-white">{activeTableCount}</p>
          <p className="mt-1 text-sm text-slate-400">Müşteriden sipariş gelen aktif masa</p>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-[#111827] p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Bell className="h-4 w-4 text-emerald-300" />
            Garson çağrısı
          </div>
          <p className="mt-2 text-3xl font-semibold text-white">{waiterCount}</p>
          <p className="mt-1 text-sm text-slate-400">Müşteri tarafından bekleyen çağrı</p>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-[#111827] p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Receipt className="h-4 w-4 text-amber-300" />
            Hesap isteği
          </div>
          <p className="mt-2 text-3xl font-semibold text-white">{billCount}</p>
          <p className="mt-1 text-sm text-slate-400">Ödeme isteyen masa sayısı</p>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-sky-600/18 to-indigo-600/18 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Sparkles className="h-4 w-4 text-sky-300" />
            QR akışı
          </div>
          <p className="mt-2 text-xl font-semibold text-white">Müşteri siparişi doğrudan POS’a düşer</p>
          <p className="mt-1 text-sm text-slate-400">Aynı masa adisyonuna eklenir, garson çağrısı ve hesap isteği izlenir.</p>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#111827] shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Masa bağlantısı</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">{row.name}</h3>
              </div>
              <div className="rounded-full bg-slate-900/80 px-3 py-1 text-sm font-semibold text-white">
                {formatMoney(row.total)}
              </div>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-3">
                <img
                  src={row.qrImageUrl}
                  alt={`${row.name} QR kodu`}
                  className="h-full w-full rounded-[1rem] bg-white object-cover"
                  loading="lazy"
                />
              </div>

              <div className="space-y-3">
                <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bağlantı</p>
                  <p className="mt-2 break-all text-sm leading-6 text-slate-200">{row.url}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyUrl(row)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-sky-400/40"
                  >
                    <Copy className="h-4 w-4" />
                    {copiedId === row.id ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
                  </button>
                  <Link
                    href={`/qr/${row.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-sky-600/90 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-500"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Menüyü aç
                  </Link>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Garson çağrısı</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {row.waiterRequestedAt ? `Bekliyor · ${formatRelativeTime(row.waiterRequestedAt)}` : 'Çağrı yok'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setTableWaiterRequested(row.id, false)}
                      className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-emerald-400/50 hover:text-white"
                    >
                      Temizle
                    </button>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hesap isteği</p>
                    <p className="mt-2 text-sm font-semibold text-white">{row.billRequested ? 'Ödeme bekliyor' : 'İstek yok'}</p>
                    <button
                      type="button"
                      onClick={() => setTablePaymentRequested(row.id, false)}
                      className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-400/50 hover:text-white"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">QR sipariş onayı</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {row.pendingOrderCount > 0 ? `${row.pendingOrderCount} sipariş garson onayı bekliyor` : 'Bekleyen sipariş yok'}
                      </p>
                    </div>
                    {row.pendingOrderIds[0] ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => approvePendingQrOrder(row.pendingOrderIds[0])}
                          className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                        >
                          Onayla
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectPendingQrOrder(row.pendingOrderIds[0])}
                          className="rounded-full border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25"
                        >
                          Reddet
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
                  <QrCode className="h-4 w-4" />
                  Masa URL’si hazır, müşteri telefonundan açılabilir
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
