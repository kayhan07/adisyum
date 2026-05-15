'use client';

import { useEffect, useMemo, useState } from 'react';
import { TableCard, type FloorTableStatus } from '@/components/floor/table-card';

type TableGridItem = {
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
};

type TablesGridProps = {
  tables: TableGridItem[];
  actionMode?: 'move' | 'merge' | null;
  actionSourceId?: string | null;
  getIsTargetCandidate?: (tableId: string) => boolean;
  onSelect?: (tableId: string) => void;
  onQuickPayment?: (tableId: string) => void;
  onQuickClear?: (tableId: string) => void;
  onQuickNote?: (tableId: string) => void;
  onQuickMove?: (tableId: string) => void;
  onQuickMerge?: (tableId: string) => void;
  onDragMove?: (sourceId: string, targetId: string) => void;
};

export function TablesGrid({
  tables,
  actionMode = null,
  actionSourceId = null,
  getIsTargetCandidate,
  onSelect,
  onQuickPayment,
  onQuickClear,
  onQuickNote,
  onQuickMove,
  onQuickMerge,
  onDragMove,
}: TablesGridProps) {
  const pageSize = 84;
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(Math.min(pageSize, tables.length));
  }, [tables.length]);

  const visibleTables = useMemo(
    () => tables.slice(0, visibleCount),
    [tables, visibleCount],
  );

  const hasMore = visibleCount < tables.length;

  if (tables.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-[#111827] p-10 text-center text-slate-400">
        Bu filtrede masa bulunamadi.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {visibleTables.map((table) => (
          <TableCard
            key={table.id}
            {...table}
            actionMode={actionMode}
            isActionSource={actionSourceId === table.id}
            isActionTargetCandidate={getIsTargetCandidate?.(table.id) ?? false}
            onClick={() => onSelect?.(table.id)}
            onQuickPayment={() => onQuickPayment?.(table.id)}
            onQuickClear={() => onQuickClear?.(table.id)}
            onQuickNote={() => onQuickNote?.(table.id)}
            onQuickMove={() => onQuickMove?.(table.id)}
            onQuickMerge={() => onQuickMerge?.(table.id)}
            onDragMove={onDragMove}
          />
        ))}
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(current + pageSize, tables.length))}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-[#111827] px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033]"
          >
            Daha fazla masa göster ({tables.length - visibleCount})
          </button>
        </div>
      ) : null}
    </div>
  );
}
