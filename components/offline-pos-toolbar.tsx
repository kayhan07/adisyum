'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, CloudRain, RefreshCw, RotateCcw, ShieldAlert, Wifi } from 'lucide-react';
import { clearOfflineOrderQueue, loadOfflineSyncSummary, subscribeToOfflineSyncChanges, syncOfflineOrders, type OfflineSyncSummary } from '@/lib/offline-sync-store';
import { loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusTone(summary: OfflineSyncSummary) {
  if (!summary.online) return { label: 'Çevrimdışı', icon: CloudOff, className: 'border-amber-400/30 bg-amber-500/15 text-amber-100' };
  if (summary.syncing) return { label: 'Senkronize ediliyor', icon: RefreshCw, className: 'border-sky-400/30 bg-sky-500/15 text-sky-100' };
  if (summary.failed > 0) return { label: 'Hata var', icon: ShieldAlert, className: 'border-rose-400/30 bg-rose-500/15 text-rose-100' };
  return { label: 'Çevrimiçi', icon: Wifi, className: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' };
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export function OfflinePosToolbar() {
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState(() => loadSessionState().tenantId);
  const [summary, setSummary] = useState<OfflineSyncSummary>(() => ({
    tenantId,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncing: false,
    pending: 0,
    failed: 0,
    retryQueue: 0,
    synced: 0,
    total: 0,
    items: [],
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const nextTenantId = loadSessionState().tenantId;
      setTenantId(nextTenantId);
      const nextSummary = await loadOfflineSyncSummary(nextTenantId);
      if (!cancelled) {
        setSummary(nextSummary);
      }
    };

    void refresh();
    const unsubscribeSession = subscribeToSessionChanges(() => void refresh());
    const unsubscribeQueue = subscribeToOfflineSyncChanges(() => void refresh());

    return () => {
      cancelled = true;
      unsubscribeSession();
      unsubscribeQueue();
    };
  }, []);

  const tone = useMemo(() => statusTone(summary), [summary]);
  const StatusIcon = tone.icon;

  async function handleSync() {
    setBusy(true);
    try {
      await syncOfflineOrders({ tenantId });
      setSummary(await loadOfflineSyncSummary(tenantId));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryFailed() {
    setBusy(true);
    try {
      await syncOfflineOrders({ tenantId, force: true });
      setSummary(await loadOfflineSyncSummary(tenantId));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearQueue() {
    setBusy(true);
    try {
      await clearOfflineOrderQueue(tenantId);
      setSummary(await loadOfflineSyncSummary(tenantId));
    } finally {
      setBusy(false);
    }
  }

  const visibleItems = summary.items.filter((item) => item.status !== 'synced').slice(0, 8);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition hover:-translate-y-0.5 ${tone.className}`}
        title="Offline POS durumu"
      >
        <StatusIcon className={`h-4 w-4 ${summary.syncing ? 'animate-spin' : ''}`} />
        <span>{tone.label}</span>
        <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs font-bold">{summary.retryQueue}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B1220] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Offline POS Merkezi</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Tenant-scope queue</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">İşlemler IndexedDB içinde tenant bazlı tutulur, bağlantı geldiğinde otomatik senkronize edilir.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Kapat
              </button>
            </div>

            <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:grid-cols-4 sm:px-5">
              <MiniMetric label="Bekleyen" value={String(summary.pending)} />
              <MiniMetric label="Başarısız" value={String(summary.failed)} />
              <MiniMetric label="Yeniden dene" value={String(summary.retryQueue)} />
              <MiniMetric label="Toplam" value={String(summary.total)} />
            </div>

            <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:grid-cols-3 sm:px-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Bağlantı</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
                  {summary.online ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <CloudOff className="h-4 w-4 text-amber-300" />}
                  {summary.online ? 'Çevrimiçi' : 'Çevrimdışı'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Son senkron</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatTimestamp(summary.lastSyncAt)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Durum</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.syncing ? 'Aktif aktarım var' : summary.failed > 0 ? 'Retry bekliyor' : 'Hazır'}</p>
              </div>
            </div>

            <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:grid-cols-3 sm:px-5">
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={busy || summary.syncing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy || summary.syncing ? 'animate-spin' : ''}`} />
                Senkronize et
              </button>
              <button
                type="button"
                onClick={() => void handleRetryFailed()}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                Hatalıları yeniden dene
              </button>
              <button
                type="button"
                onClick={() => void handleClearQueue()}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AlertCircle className="h-4 w-4" />
                Kuyruğu temizle
              </button>
            </div>

            <div className="grid gap-3 px-4 py-4 sm:px-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Bekleyen işlemler</h3>
                  <span className="text-xs text-slate-400">{visibleItems.filter((item) => item.status === 'pending').length} öğe</span>
                </div>
                <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                  {visibleItems.length > 0 ? visibleItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.operationType}</p>
                          <p className="mt-0.5 text-xs text-slate-400">Masa {item.tableId} · Şube {item.branchId} · {formatTimestamp(item.updatedAt)}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'failed' ? 'bg-rose-500/15 text-rose-100' : item.status === 'syncing' ? 'bg-sky-500/15 text-sky-100' : 'bg-amber-500/15 text-amber-100'}`}>
                          {item.status === 'failed' ? 'Başarısız' : item.status === 'syncing' ? 'Senkron' : 'Bekliyor'}
                        </span>
                      </div>
                      {item.lastError ? <p className="mt-2 text-xs leading-5 text-rose-200/80">{item.lastError}</p> : null}
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-slate-400">
                      Bekleyen offline işlem yok.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Başarısız sync</h3>
                  <span className="text-xs text-slate-400">{summary.failed} öğe</span>
                </div>
                <div className="mt-3 space-y-2">
                  {summary.items.filter((item) => item.status === 'failed').slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
                      <p className="font-semibold">{item.operationType}</p>
                      <p className="mt-1 text-xs leading-5 text-rose-100/75">{item.lastError ?? 'Bilinmeyen hata'} · {item.attempts} deneme</p>
                    </div>
                  ))}
                  {summary.failed === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-slate-400">Başarısız sync bulunmuyor.</div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Retry queue</h3>
                  <span className="text-xs text-slate-400">Tekrar denenebilir işlemler</span>
                </div>
                <div className="mt-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-3 py-3 text-sm text-sky-50">
                  Bağlantı geri geldiğinde otomatik sync tetiklenir. Uygulama odakta olduğunda da kuyruk yeniden kontrol edilir.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}