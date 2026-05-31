'use client';

import { Sofa, Trash2 } from 'lucide-react';

type TableSetupPanelProps = {
  groups: readonly string[];
  selectedGroup: string;
  selectedTables: readonly {
    id: string;
    name: string;
    total?: number;
    status?: string;
  }[];
  onSelectGroup: (group: string) => void;
  startNo: string;
  endNo: string;
  onStartNoChange: (value: string) => void;
  onEndNoChange: (value: string) => void;
  onCreate: () => void;
  onDeleteGroup: () => void;
  onDeleteTable: (tableId: string) => void;
  selectedGroupCount: number;
};

export function TableSetupPanel({
  groups,
  selectedGroup,
  selectedTables,
  onSelectGroup,
  startNo,
  endNo,
  onStartNoChange,
  onEndNoChange,
  onCreate,
  onDeleteGroup,
  onDeleteTable,
  selectedGroupCount,
}: TableSetupPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4 shadow-[0_12px_28px_rgba(2,6,23,0.2)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Masa tanımlama</h3>
          <p className="mt-1 text-sm text-slate-400">Sabit gruplardan seç, numara aralığı ver ve toplu masa oluştur.</p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
          {selectedGroup} grubunda {selectedGroupCount} masa
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-300">Masa grupları</p>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => onSelectGroup(group)}
                className={selectedGroup === group
                  ? 'inline-flex h-10 items-center gap-2 rounded-full bg-sky-500/18 px-4 text-sm font-semibold text-sky-100 ring-1 ring-sky-400/35'
                  : 'inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-300 transition hover:bg-[#172033] hover:text-white'}
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px_170px] xl:grid-cols-[minmax(0,1fr)_120px_120px_180px_180px]">
          <label className="block">
            <span className="text-sm text-slate-400">Seçili grup</span>
            <div className="mt-2 flex h-11 items-center rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-white">
              {selectedGroup}
            </div>
          </label>

          <label className="block">
            <span className="text-sm text-slate-400">Başlangıç no</span>
            <input
              value={startNo}
              onChange={(event) => onStartNoChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-400">Bitiş no</span>
            <input
              value={endNo}
              onChange={(event) => onEndNoChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-white outline-none"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              <Sofa className="h-4 w-4" /> Masaları oluştur
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={onDeleteGroup}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              <Trash2 className="h-4 w-4" /> Grubu sil
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Seçili grup masaları</p>
              <p className="mt-1 text-xs text-slate-500">Tek masa silme kalıcıdır; aktif adisyonu olan masa silinmez.</p>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">{selectedTables.length} masa</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {selectedTables.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-[#111827] px-3 py-3 text-sm text-slate-400">Bu grupta masa yok.</p>
            ) : selectedTables.map((table) => (
              <div key={table.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111827] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{table.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{(table.total ?? 0) > 0 ? 'Aktif adisyon var' : table.status === 'reserved' ? 'Rezervasyonlu' : 'Boş'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTable(table.id)}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Sil
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
