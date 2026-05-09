'use client';

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
}: TablesGridProps) {
  if (tables.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-[#111827] p-10 text-center text-slate-400">
        Bu filtrede masa bulunamadi.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {tables.map((table) => (
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
        />
      ))}
    </div>
  );
}
