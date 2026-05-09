'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ChefHat, Clock3, CupSoda, Dessert, RadioTower, RefreshCcw, Volume2, VolumeX } from 'lucide-react';
import type { KdsRealtimePayload, KdsStation, KdsStatus, KdsTicket, KdsTicketsResponse } from '@/lib/kds-types';
import { getKdsEcho, kdsChannelName } from '@/lib/realtime/kds-echo';

const stations = [
  { id: 'kitchen', label: 'Mutfak', icon: ChefHat },
  { id: 'bar', label: 'Bar', icon: CupSoda },
  { id: 'dessert', label: 'Tatlı', icon: Dessert },
] as const;

const statusColumns = [
  { id: 'new', label: 'Yeni', badgeClass: 'bg-sky-500/16 text-sky-200 ring-sky-400/30' },
  { id: 'preparing', label: 'Hazırlanıyor', badgeClass: 'bg-amber-500/16 text-amber-200 ring-amber-400/30' },
  { id: 'ready', label: 'Hazır', badgeClass: 'bg-emerald-500/16 text-emerald-200 ring-emerald-400/30' },
] as const;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function minutesSince(createdAt: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
}

function timerLabel(createdAt: string, now: number) {
  const minutes = minutesSince(createdAt, now);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours > 0) {
    return `${hours}s ${remainder}dk`;
  }

  return `${minutes} dk`;
}

function isDelayed(ticket: KdsTicket, now: number) {
  return ticket.status !== 'ready' && minutesSince(ticket.created_at, now) >= 10;
}

function nextStatus(status: KdsStatus): KdsStatus | null {
  if (status === 'new') return 'preparing';
  if (status === 'preparing') return 'ready';
  return null;
}

function upsertTicket(current: KdsTicket[], nextTicket: KdsTicket) {
  const remaining = current.filter((ticket) => ticket.id !== nextTicket.id);
  return [...remaining, nextTicket].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

function playTone(kind: 'new' | 'ready' | 'delay') {
  if (typeof window === 'undefined') return;

  const frequencies: Record<typeof kind, number> = {
    new: 760,
    ready: 980,
    delay: 420,
  };
  const duration = kind === 'delay' ? 0.22 : 0.14;

  try {
    const audioWindow = window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.type = kind === 'delay' ? 'triangle' : 'sine';
    oscillator.frequency.value = frequencies[kind];
    gain.gain.value = 0.05;
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.onended = () => void context.close();
  } catch {
    // Tarayıcı ses izni yoksa KDS sessiz çalışmaya devam eder.
  }
}

type KdsBoardProps = {
  branchId?: string;
};

export function KdsBoard({ branchId }: KdsBoardProps) {
  const [station, setStation] = useState<KdsStation>('kitchen');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const deferredTickets = useDeferredValue(tickets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [syncMode, setSyncMode] = useState<'canli' | 'yedek'>('yedek');
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [delayedPlayed, setDelayedPlayed] = useState<Record<string, true>>({});
  const firstLoadDone = useRef(false);

  async function refreshTickets(silent = false) {
    if (!silent) setLoading(true);

    try {
      setError(null);
      const query = new URLSearchParams({ channel: station });
      if (branchId) query.set('branchId', branchId);

      const response = await fetch(`/api/kds/tickets?${query.toString()}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as KdsTicketsResponse | { message?: string } | null;

      if (!response.ok || !payload || !('tickets' in payload)) {
        throw new Error(payload && 'message' in payload ? payload.message : 'KDS verisi alınamadı.');
      }

      setTenantId(payload.tenant_id);
      startTransition(() => {
        setTickets(payload.tickets);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'KDS verisi alınamadı.');
    } finally {
      if (!silent) setLoading(false);
      firstLoadDone.current = true;
    }
  }

  async function updateStatus(ticketId: string, status: KdsStatus) {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);
    if (!currentTicket) return;

    const optimisticTicket = { ...currentTicket, status };
    setUpdatingTicketId(ticketId);
    startTransition(() => {
      setTickets((current) => upsertTicket(current, optimisticTicket));
    });

    try {
      const response = await fetch(`/api/kds/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, branchId }),
      });
      const payload = (await response.json().catch(() => null)) as KdsTicket | { message?: string } | null;

      if (!response.ok || !payload || !('id' in payload)) {
        throw new Error(payload && 'message' in payload ? payload.message : 'KDS durumu güncellenemedi.');
      }

      startTransition(() => {
        setTickets((current) => upsertTicket(current, payload));
      });

      if (soundEnabled && status === 'ready') playTone('ready');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'KDS durumu güncellenemedi.');
      startTransition(() => {
        setTickets((current) => upsertTicket(current, currentTicket));
      });
    } finally {
      setUpdatingTicketId(null);
    }
  }

  useEffect(() => {
    void refreshTickets();
  }, [station, branchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const reconciliationTimer = window.setInterval(() => {
      void refreshTickets(true);
    }, 8000);

    return () => window.clearInterval(reconciliationTimer);
  }, [station, branchId]);

  useEffect(() => {
    if (!tenantId) return;

    const echo = getKdsEcho();
    if (!echo) {
      setSyncMode('yedek');
      return;
    }

    const channelName = kdsChannelName(tenantId, station);
    const channel = echo.channel(channelName);
    setSyncMode('canli');

    const pushRealtimeTicket = (payload: KdsRealtimePayload, tone?: 'new' | 'ready' | 'delay') => {
      startTransition(() => {
        setTickets((current) => upsertTicket(current, payload.ticket));
      });
      if (soundEnabled && tone) playTone(tone);
    };

    channel.listen('.order.created', (payload: KdsRealtimePayload) => pushRealtimeTicket(payload, 'new'));
    channel.listen('.order.status.updated', (payload: KdsRealtimePayload) => pushRealtimeTicket(payload, payload.ticket.status === 'ready' ? 'ready' : undefined));
    channel.listen('.order.delayed', (payload: KdsRealtimePayload) => pushRealtimeTicket(payload, 'delay'));

    return () => {
      echo.leave(channelName);
      setSyncMode('yedek');
    };
  }, [tenantId, station, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return;

    deferredTickets.forEach((ticket) => {
      if (isDelayed(ticket, now) && !delayedPlayed[ticket.id]) {
        playTone('delay');
        setDelayedPlayed((current) => ({ ...current, [ticket.id]: true }));
      }
    });
  }, [deferredTickets, delayedPlayed, now, soundEnabled]);

  const liveColumns = useMemo(
    () => statusColumns.map((column) => ({
      ...column,
      tickets: deferredTickets.filter((ticket) => ticket.status === column.id),
    })),
    [deferredTickets],
  );

  const delayedCount = useMemo(
    () => deferredTickets.filter((ticket) => isDelayed(ticket, now)).length,
    [deferredTickets, now],
  );

  const totalCount = deferredTickets.length;
  const activeStation = stations.find((item) => item.id === station) ?? stations[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
        <header className="rounded-[28px] border border-white/10 bg-[#111C30] p-5 shadow-[0_20px_80px_rgba(2,8,23,0.45)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 ring-1 ring-white/10">
                <RadioTower className="h-3.5 w-3.5 text-[#38BDF8]" />
                Canlı mutfak ekranı
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Sipariş akışı</h1>
              <p className="mt-2 max-w-2xl text-base text-slate-300">
                {activeStation.label} istasyonundaki siparişleri tek bakışta görün. Geciken işleri kırmızı vurguyla hemen ayırt edin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10">Toplam {totalCount} sipariş</span>
              <span className={`rounded-full px-4 py-3 text-sm font-semibold ring-1 ${delayedCount > 0 ? 'bg-rose-500/16 text-rose-200 ring-rose-400/30' : 'bg-emerald-500/16 text-emerald-200 ring-emerald-400/30'}`}>
                {delayedCount > 0 ? `${delayedCount} geciken sipariş` : 'Gecikme yok'}
              </span>
              <span className={`rounded-full px-4 py-3 text-sm font-semibold ring-1 ${syncMode === 'canli' ? 'bg-sky-500/16 text-sky-200 ring-sky-400/30' : 'bg-amber-500/16 text-amber-200 ring-amber-400/30'}`}>
                {syncMode === 'canli' ? 'Canlı senkron' : 'Yedek eşitleme'}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-3">
              {stations.map((item) => {
                const active = item.id === station;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStation(item.id)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      active ? 'bg-white text-[#0F172A] shadow-sm' : 'bg-white/5 text-slate-200 ring-1 ring-white/10 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSoundEnabled((current) => !current)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {soundEnabled ? 'Ses açık' : 'Ses kapalı'}
              </button>
              <button
                type="button"
                onClick={() => void refreshTickets()}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <RefreshCcw className="h-4 w-4" /> Yenile
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-[22px] border border-rose-400/30 bg-rose-500/12 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-3">
          {liveColumns.map((column) => (
            <section key={column.id} className="rounded-[28px] border border-white/10 bg-[#111C30] p-4 shadow-[0_18px_60px_rgba(2,8,23,0.32)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Durum</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{column.label}</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${column.badgeClass}`}>{column.tickets.length}</span>
              </div>

              <div className="mt-4 flex max-h-[calc(100vh-16rem)] flex-col gap-4 overflow-y-auto pr-1">
                {loading && !firstLoadDone.current ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-56 animate-pulse rounded-[22px] bg-white/5" />
                  ))
                ) : column.tickets.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-[#0B1323] px-5 py-8 text-center text-sm text-slate-400">
                    Bu sütunda bekleyen sipariş yok.
                  </div>
                ) : (
                  column.tickets.map((ticket) => {
                    const delayed = isDelayed(ticket, now);
                    const busy = updatingTicketId === ticket.id;
                    const next = nextStatus(ticket.status);

                    return (
                      <article
                        key={ticket.id}
                        className={`rounded-[24px] border p-4 shadow-[0_14px_40px_rgba(2,8,23,0.24)] transition ${
                          delayed ? 'border-rose-400/40 bg-rose-500/10' : 'border-white/10 bg-[#0B1323]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Masa</p>
                            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                              {normalizeText(ticket.table_name) || 'Salon siparişi'}
                            </h3>
                            <p className="mt-2 text-sm text-slate-400">
                              {ticket.order_number ? `Sipariş ${normalizeText(ticket.order_number)}` : 'Sipariş numarası bekleniyor'}
                            </p>
                          </div>

                          <div className={`rounded-2xl px-4 py-3 text-right ring-1 ${delayed ? 'bg-rose-500/16 text-rose-100 ring-rose-400/30' : 'bg-white/5 text-slate-100 ring-white/10'}`}>
                            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                              <Clock3 className="h-4 w-4" /> Süre
                            </div>
                            <p className="mt-2 text-2xl font-semibold tracking-tight">{timerLabel(ticket.created_at, now)}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {ticket.items.map((item) => (
                            <div key={`${ticket.id}-${item.id}`} className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-lg font-semibold text-white">{normalizeText(item.name)}</p>
                                  <p className="mt-1 text-sm text-slate-400">{item.note?.trim() ? normalizeText(item.note) : 'Not yok'}</p>
                                </div>
                                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">x{item.quantity}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 ring-1 ring-white/10">
                            <BellRing className="h-3.5 w-3.5" />
                            {delayed ? 'Gecikti' : 'Akışta'}
                          </div>

                          <div className="flex gap-2">
                            {ticket.status !== 'new' ? (
                              <button
                                type="button"
                                onClick={() => void updateStatus(ticket.id, 'new')}
                                disabled={busy}
                                className="rounded-xl bg-sky-500/14 px-3 py-2 text-sm font-semibold text-sky-100 ring-1 ring-sky-400/30 transition hover:bg-sky-500/22 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Yeni
                              </button>
                            ) : null}
                            {next ? (
                              <button
                                type="button"
                                onClick={() => void updateStatus(ticket.id, next)}
                                disabled={busy}
                                className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  next === 'preparing'
                                    ? 'bg-amber-500/16 text-amber-100 ring-1 ring-amber-400/30 hover:bg-amber-500/22'
                                    : 'bg-emerald-500/16 text-emerald-100 ring-1 ring-emerald-400/30 hover:bg-emerald-500/22'
                                }`}
                              >
                                {next === 'preparing' ? 'Hazırlanıyor' : 'Hazır'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </section>
      </div>
    </div>
  );
}
