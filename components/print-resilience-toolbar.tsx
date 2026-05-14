'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Printer, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import {
  clearAckedPrintJobs,
  loadPrintResilienceSummary,
  processPrintQueue,
  reprintFailedJob,
  retryFailedPrintJobs,
  runPrinterHeartbeat,
  subscribeToPrintResilienceChanges,
  type PrintResilienceSummary,
} from '@/lib/print-resilience-store';
import { loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusTone(summary: PrintResilienceSummary) {
  if (!summary.online) return { label: 'Ağ Çevrimdışı', icon: WifiOff, className: 'border-amber-400/30 bg-amber-500/15 text-amber-100' };
  if (summary.processing) return { label: 'Yazdırma İşleniyor', icon: RefreshCw, className: 'border-sky-400/30 bg-sky-500/15 text-sky-100' };
  if (summary.failed > 0) return { label: 'Print Hatası', icon: AlertTriangle, className: 'border-rose-400/30 bg-rose-500/15 text-rose-100' };
  return { label: 'Yazıcı Sağlıklı', icon: CheckCircle2, className: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export function PrintResilienceToolbar() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tenantId, setTenantId] = useState(() => loadSessionState().tenantId);
  const [summary, setSummary] = useState<PrintResilienceSummary>(() => ({
    tenantId: tenantId ?? '',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    processing: false,
    pending: 0,
    printing: 0,
    failed: 0,
    acked: 0,
    retryQueue: 0,
    total: 0,
    jobs: [],
    printers: [],
  }));

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const nextTenantId = loadSessionState().tenantId;
      const nextSummary = await loadPrintResilienceSummary(nextTenantId);
      if (!cancelled) {
        setTenantId(nextTenantId);
        setSummary(nextSummary);
      }
    };

    void refresh();

    const unsubscribeSession = subscribeToSessionChanges(() => void refresh());
    const unsubscribeQueue = subscribeToPrintResilienceChanges(() => void refresh());

    return () => {
      cancelled = true;
      unsubscribeSession();
      unsubscribeQueue();
    };
  }, []);

  const tone = useMemo(() => statusTone(summary), [summary]);
  const ToneIcon = tone.icon;

  const failedJobs = summary.jobs.filter((job) => job.status === 'failed').slice(0, 8);

  const refreshSummary = async () => {
    setSummary(await loadPrintResilienceSummary(tenantId));
  };

  const withBusy = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await refreshSummary();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition hover:-translate-y-0.5 ${tone.className}`}
        title="Print resilience"
      >
        <ToneIcon className={`h-4 w-4 ${summary.processing ? 'animate-spin' : ''}`} />
        <span>Print</span>
        <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs font-bold">{summary.retryQueue}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B1220] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Enterprise Print Resilience</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Kitchen / Bar güvenilir yazdırma</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">Siparişler tenant bazlı kuyruğa alınır, ACK doğrulanır, başarısız işler otomatik ve manuel olarak yeniden basılır.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Kapat
              </button>
            </div>

            <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:grid-cols-5 sm:px-5">
              <Metric label="Bekleyen" value={String(summary.pending)} />
              <Metric label="Printing" value={String(summary.printing)} />
              <Metric label="Başarısız" value={String(summary.failed)} />
              <Metric label="ACK" value={String(summary.acked)} />
              <Metric label="Toplam" value={String(summary.total)} />
            </div>

            <div className="grid gap-3 border-b border-white/10 px-4 py-4 sm:grid-cols-4 sm:px-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void withBusy(async () => { await processPrintQueue({ tenantId, force: true, reason: 'manual.process' }); })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                Kuyruğu işle
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withBusy(async () => { await retryFailedPrintJobs(tenantId); })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                Failed retry
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withBusy(async () => { await runPrinterHeartbeat({ tenantId }); })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Activity className="h-4 w-4" />
                Heartbeat
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withBusy(async () => { await clearAckedPrintJobs(tenantId); })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer className="h-4 w-4" />
                ACK temizle
              </button>
            </div>

            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Failed print recovery</h3>
                  <span className="text-xs text-slate-400">{summary.failed} iş</span>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                  {failedJobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-rose-50">{job.ticketType.toUpperCase()} · {job.printerName}</p>
                          <p className="mt-0.5 text-xs text-rose-100/75">Deneme {job.attempts}/{job.maxAttempts} · {formatTimestamp(job.updatedAt)}</p>
                          {job.lastError ? <p className="mt-1 text-xs text-rose-100/75">{job.lastError}</p> : null}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void withBusy(async () => { await reprintFailedJob(job.id, tenantId); })}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200/30 bg-rose-100/10 px-3 text-xs font-semibold text-rose-50 transition hover:bg-rose-100/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Yeniden bas
                        </button>
                      </div>
                    </div>
                  ))}
                  {failedJobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-slate-400">Başarısız print işi yok.</div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Printer health</h3>
                  <span className="text-xs text-slate-400">{summary.printers.length} yazıcı</span>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                  {summary.printers.map((printer) => (
                    <div key={printer.printerName} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{printer.printerName}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${printer.online ? 'bg-emerald-500/15 text-emerald-100' : 'bg-amber-500/15 text-amber-100'}`}>
                          {printer.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">Heartbeat: {formatTimestamp(printer.lastHeartbeatAt)} · Fail: {printer.failureCount}</p>
                      {printer.lastError ? <p className="mt-1 text-xs text-amber-100/80">{printer.lastError}</p> : null}
                    </div>
                  ))}
                  {summary.printers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-slate-400">Kayıtlı yazıcı heartbeat verisi yok.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
