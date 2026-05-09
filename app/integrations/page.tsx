'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  getDefaultIntegrationState,
  loadIntegrationState,
  saveIntegrationState,
  subscribeToIntegrationChanges,
  type PrintLogRecord,
} from '@/lib/integration-store';

function formatNow() {
  return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function IntegrationsPage() {
  const [state, setState] = useState(() => getDefaultIntegrationState());
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => setState(loadIntegrationState());
    refresh();
    const unsubscribe = subscribeToIntegrationChanges(refresh);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedPrinterId && state.printerDevices[0]) {
      setSelectedPrinterId(state.printerDevices[0].id);
    }
  }, [selectedPrinterId, state.printerDevices]);

  const queueSummary = useMemo(() => {
    const waiting = state.printLogs.filter((log) => log.status === 'Bekliyor').length;
    const sent = state.printLogs.filter((log) => log.status === 'Gönderildi').length;
    const failed = state.printLogs.filter((log) => log.status === 'Failover' || log.status === 'Hata').length;
    const failover = state.printerDevices.filter((printer) => printer.status === 'Yedek').length;
    return [
      { label: 'Bekleyen', value: String(waiting), tone: 'bg-sky-500/10 text-sky-600' },
      { label: 'Gönderilen', value: String(sent), tone: 'bg-emerald-500/10 text-emerald-600' },
      { label: 'Başarısız', value: String(failed), tone: 'bg-red-500/10 text-red-600' },
      { label: 'Failover', value: failover > 0 ? `${failover} aktif` : '0', tone: 'bg-amber-400/15 text-amber-700' },
    ];
  }, [state]);

  function persist(nextState: ReturnType<typeof loadIntegrationState>) {
    saveIntegrationState(nextState);
    setState(nextState);
  }

  function retryFailedJobs() {
    const nextLogs = state.printLogs.map((log) =>
      log.status === 'Failover' || log.status === 'Bekliyor'
        ? { ...log, status: 'Gönderildi', info: 'Operatör yeniden denedi', time: formatNow() }
        : log,
    );
    const nextPrinters = state.printerDevices.map((printer) => ({
      ...printer,
      queue: nextLogs.filter((log) => log.printer === printer.name && log.status === 'Bekliyor').length,
    }));
    persist({ ...state, printLogs: nextLogs, printerDevices: nextPrinters });
    setMessage('Bekleyen ve hatalı işler yeniden işlendi.');
  }

  function manualReprint() {
    const printer = state.printerDevices.find((item) => item.id === selectedPrinterId);
    if (!printer) return;

    const log: PrintLogRecord = {
      id: `manual-${Date.now()}`,
      order: `MANUAL-${Date.now()}`,
      printer: printer.name,
      status: 'Gönderildi',
      time: formatNow(),
      info: 'Operatör manuel yeniden yazdırdı',
    };

    persist({
      ...state,
      printLogs: [log, ...state.printLogs],
    });
    setMessage(`${printer.name} için manuel yeniden yazdırma işlendi.`);
  }

  function forceBackup() {
    const printer = state.printerDevices.find((item) => item.id === selectedPrinterId);
    if (!printer) return;

    const nextPrinters = state.printerDevices.map((item) => {
      if (item.group !== printer.group) return item;
      if (item.id === printer.id) return { ...item, status: 'Yedek' as const };
      if (item.name === printer.backup || item.role.includes('Yedek')) return { ...item, status: 'Aktif' as const };
      return item;
    });

    const nextLogs = [{
      id: `failover-${Date.now()}`,
      order: `SYS-${Date.now()}`,
      printer: printer.name,
      status: 'Failover',
      time: formatNow(),
      info: 'Operatör yedek yazıcıyı zorla devreye aldı',
    }, ...state.printLogs];

    persist({ ...state, printerDevices: nextPrinters, printLogs: nextLogs });
    setMessage(`${printer.group} için yedek yazıcı devreye alındı.`);
  }

  function exportLogs() {
    const payload = JSON.stringify(state.printLogs, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).catch(() => undefined);
    }
    setMessage('Yazdırma kayıtları panoya kopyalandı.');
  }

  return (
    <AppShell
      title="Entegrasyonlar ve yazıcı yönetimi"
      subtitle="Kuyruk yönetimi, otomatik yeniden deneme, yedek yazıcı devralma ve manuel yeniden yazdırma akışını tek merkezden yönetin."
      actions={<button type="button" onClick={() => document.getElementById('yazici-filosu')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">Yazıcı Filosuna Git</button>}
    >
      <section className="grid gap-4 md:grid-cols-4">
        {queueSummary.map((item) => (
          <div key={item.label} className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">{item.label}</p>
            <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      {message ? (
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div id="yazici-filosu" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Yazıcı filosu</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Kuyruk ve failover hazır cihazlar</h2>
            </div>
            <button type="button" onClick={() => document.getElementById('operasyon-araclari')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted">Kuyruğu işle</button>
          </div>
          <div className="mt-4 space-y-3">
            {state.printerDevices.map((printer) => (
              <button
                key={printer.id}
                type="button"
                onClick={() => setSelectedPrinterId(printer.id)}
                className={`w-full rounded-3xl border px-4 py-4 text-left ${selectedPrinterId === printer.id ? 'border-accent bg-accentSoft/40' : 'border-line bg-canvas'}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-ink">{printer.name}</p>
                    <p className="text-sm text-muted">{printer.role} · {printer.group}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-accentSoft px-3 py-1 font-semibold text-accent">{printer.status}</span>
                    <span className="rounded-full border border-line px-3 py-1 text-muted">Kuyruk {printer.queue}</span>
                    <span className="rounded-full border border-line px-3 py-1 text-muted">Yeniden deneme {printer.retry}</span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-muted md:grid-cols-3">
                  <div>{printer.ip}:{printer.port}</div>
                  <div>Yedek: {printer.backup}</div>
                  <div>Hat: {printer.group}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Yönlendirme kuralları</p>
            <div className="mt-4 space-y-3">
              {state.printerMappings.map((mapping) => (
                <div key={mapping.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{mapping.category}</p>
                    <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">Birincil + yedek</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">Ana: {mapping.printer}</p>
                  <p className="mt-1 text-sm text-muted">Yedek: {mapping.fallback}</p>
                  <p className="mt-2 text-sm text-ink">{mapping.load}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="operasyon-araclari" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Operasyon araçları</p>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={retryFailedJobs} className="rounded-3xl bg-accent px-4 py-4 text-sm font-semibold text-white">Başarısız işleri yeniden dene</button>
              <button type="button" onClick={manualReprint} className="rounded-3xl border border-line px-4 py-4 text-sm font-semibold text-ink">Seçili yazıcıya manuel yeniden yazdır</button>
              <button type="button" onClick={forceBackup} className="rounded-3xl border border-line px-4 py-4 text-sm font-semibold text-ink">Yedek yazıcıyı zorla devreye al</button>
            </div>
          </div>
        </div>
      </section>

      <section id="yazdirma-kayitlari" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Yazdırma kayıtları</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Her iş için zaman, yazıcı ve durum takibi</h2>
          </div>
          <button type="button" onClick={exportLogs} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted">Kayıtları dışa aktar</button>
        </div>
        <div className="mt-4 space-y-3">
          {state.printLogs.map((log) => (
            <div key={log.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-canvas px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-ink">{log.order}</p>
                <p className="text-sm text-muted">{log.printer}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-accentSoft px-3 py-1 font-semibold text-accent">{log.status}</span>
                <span className="text-muted">{log.info}</span>
                <span className="text-muted">{log.time}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
