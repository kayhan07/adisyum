'use client';

import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowRightLeft, CreditCard, GitMerge, StickyNote, TimerReset, Trash2, Users, Clock3 } from 'lucide-react';

export type FloorTableStatus = 'available' | 'occupied' | 'payment' | 'reserved';

type TableCardProps = {
  id: string;
  name: string;
  group: string;
  guestCount: number;
  total: number;
  status: FloorTableStatus;
  reservationName?: string;
  reservationPhone?: string;
  reservationStatus?: 'arrived' | 'no_show' | 'waiting';
  openedMinutes: number;
  lastActionMinutes: number;
  highTotal: boolean;
  longOpen: boolean;
  actionMode?: 'move' | 'merge' | null;
  isActionSource?: boolean;
  isActionTargetCandidate?: boolean;
  onClick?: () => void;
  onQuickPayment?: () => void;
  onQuickClear?: () => void;
  onQuickNote?: () => void;
  onQuickMove?: () => void;
  onQuickMerge?: () => void;
  onDragMove?: (sourceId: string, targetId: string) => void;
};

const statusUi: Record<
  FloorTableStatus,
  { label: string; card: string; badge: string; amount: string; meta: string }
> = {
  available: {
    label: 'Boş',
    card: 'border-slate-400/75 bg-[linear-gradient(180deg,#636d78,#57616d)] shadow-[0_0_0_1px_rgba(226,232,240,0.05),0_0_10px_rgba(148,163,184,0.08)] hover:border-slate-300/85 hover:bg-[linear-gradient(180deg,#6c7682,#5f6975)]',
    badge: 'border border-white/10 bg-black/10 text-slate-100',
    amount: 'text-slate-50',
    meta: 'text-slate-200/90',
  },
  occupied: {
    label: 'Aktif',
    card: 'border-emerald-300/38 bg-[linear-gradient(180deg,#0f3b34,#0d2f2a)] shadow-[0_0_0_1px_rgba(16,185,129,0.16),0_0_18px_rgba(16,185,129,0.16)] hover:border-emerald-200/52 hover:bg-[linear-gradient(180deg,#12463e,#103a33)]',
    badge: 'border border-emerald-200/28 bg-emerald-300/15 text-emerald-50',
    amount: 'text-slate-50',
    meta: 'text-emerald-100/85',
  },
  payment: {
    label: 'Ödeme',
    card: 'border-amber-300/85 bg-[linear-gradient(180deg,#3c2a0d,#312109)] shadow-[0_0_0_1px_rgba(251,191,36,0.24),0_0_30px_rgba(245,158,11,0.28)] animate-pulse',
    badge: 'border border-amber-200/18 bg-amber-200/14 text-amber-50',
    amount: 'text-amber-50',
    meta: 'text-amber-100/80',
  },
  reserved: {
    label: 'Rezerve',
    card: 'border-fuchsia-300/42 bg-[linear-gradient(180deg,#4a153a,#3a112f)] shadow-[0_0_0_1px_rgba(217,70,239,0.2),0_0_18px_rgba(192,38,211,0.16)] hover:border-fuchsia-200/58 hover:bg-[linear-gradient(180deg,#561945,#451438)]',
    badge: 'border border-fuchsia-200/30 bg-fuchsia-300/16 text-fuchsia-50',
    amount: 'text-slate-50',
    meta: 'text-fuchsia-100/82',
  },
};

function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}d`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}s ${remaining}d` : `${hours}s`;
}

function reservationStatusLabel(status?: 'arrived' | 'no_show' | 'waiting') {
  if (status === 'arrived') return 'Geldi';
  if (status === 'no_show') return 'Gelmedi';
  return 'Bekliyor';
}

export function TableCard({
  id,
  name,
  guestCount,
  total,
  status,
  reservationName,
  reservationStatus,
  openedMinutes,
  lastActionMinutes,
  longOpen,
  actionMode,
  isActionSource,
  isActionTargetCandidate,
  onClick,
  onQuickPayment,
  onQuickClear,
  onQuickNote,
  onQuickMove,
  onQuickMerge,
  onDragMove,
}: TableCardProps) {
  const ui = statusUi[status];
  const targetGlow = actionMode && isActionTargetCandidate ? 'ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-transparent' : '';
  const sourceGlow = isActionSource ? 'ring-2 ring-violet-300/70 ring-offset-1 ring-offset-transparent' : '';
  const hasOrder = total > 0;
  const [dragHover, setDragHover] = useState(false);

  function runQuickAction(event: MouseEvent<HTMLButtonElement>, callback?: () => void) {
    event.stopPropagation();
    callback?.();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData('text/table-id', id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragHover(true);
  }

  function handleDragLeave() {
    setDragHover(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragHover(false);
    const sourceId = event.dataTransfer.getData('text/table-id');
    if (!sourceId || sourceId === id) return;
    onDragMove?.(sourceId, id);
  }

  const quickButtonClass = 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/14 text-slate-100 transition hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      draggable={hasOrder}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full rounded-[1.05rem] border px-2.5 py-2.5 text-left transition-all duration-[120ms] ease-out shadow-[0_6px_16px_rgba(2,6,23,0.16),0_0_8px_rgba(96,165,250,0.04)] hover:-translate-y-[2px] hover:shadow-[0_14px_28px_rgba(2,6,23,0.24),0_0_12px_rgba(96,165,250,0.06)] active:scale-[0.985] ${ui.card} ${targetGlow} ${sourceGlow} ${dragHover ? 'ring-2 ring-sky-300/70' : ''} ${longOpen && status !== 'payment' ? 'shadow-[0_0_0_1px_rgba(245,158,11,0.14),0_0_16px_rgba(245,158,11,0.08)]' : ''}`}
      aria-label={`${name} masasını aç`}
      data-table-id={id}
    >
      <div className="flex min-h-[116px] flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[1.14rem] font-bold tracking-tight text-white">{name}</p>
            {status === 'reserved' && reservationName ? (
              <p className={`mt-0.5 truncate text-[10px] ${ui.meta}`}>
                {reservationName} · {reservationStatusLabel(reservationStatus)}
              </p>
            ) : null}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.badge}`}>{ui.label}</span>
        </div>

        <div className="pt-1.5">
          <p className="text-[0.92rem] font-semibold tracking-tight text-slate-100/95">
            {formatTRY(total)}
          </p>
        </div>

        <div className="space-y-1.5 pt-1.5">
          <div className={`flex items-center justify-between gap-2 text-[10px] ${ui.meta}`}>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {guestCount}
              </span>
              <span className={`inline-flex items-center gap-1 ${longOpen ? 'font-semibold text-amber-200' : ''}`}>
                <Clock3 className="h-3 w-3" />
                {formatMinutes(openedMinutes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <TimerReset className="h-3 w-3" />
                {formatMinutes(lastActionMinutes)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            {longOpen && status !== 'payment' ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                Uyarı
              </span>
            ) : (
              <span />
            )}
            {actionMode && (isActionTargetCandidate || isActionSource) ? (
              <span className="inline-flex h-6 items-center justify-center rounded-lg bg-white/10 px-2 text-[9px] font-semibold text-white shadow-sm">
                {isActionSource ? 'Kaynak' : 'Hedef'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <button type="button" title="Masa notu" className={quickButtonClass} onClick={(event) => runQuickAction(event, onQuickNote)}>
                  <StickyNote className="h-[18px] w-[18px]" />
                </button>
                <button type="button" title="Masa taşı" className={quickButtonClass} onClick={(event) => runQuickAction(event, onQuickMove)} disabled={!hasOrder && status !== 'reserved'}>
                  <ArrowRightLeft className="h-[18px] w-[18px]" />
                </button>
                <button type="button" title="Masa birleştir" className={quickButtonClass} onClick={(event) => runQuickAction(event, onQuickMerge)} disabled={!hasOrder}>
                  <GitMerge className="h-[18px] w-[18px]" />
                </button>
                <button type="button" title="Ödeme al" className={quickButtonClass} onClick={(event) => runQuickAction(event, onQuickPayment)} disabled={!hasOrder}>
                  <CreditCard className="h-[18px] w-[18px]" />
                </button>
                <button type="button" title="Masayı temizle" className={quickButtonClass} onClick={(event) => runQuickAction(event, onQuickClear)} disabled={!hasOrder && status !== 'reserved'}>
                  <Trash2 className="h-[18px] w-[18px]" />
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

