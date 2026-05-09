'use client';

export type StatusFilter = 'all' | 'available' | 'occupied' | 'payment' | 'reserved';

type TableFiltersProps = {
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  group: string;
  onGroupChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  groups: string[];
  counts: Record<StatusFilter, number>;
};

const filterItems: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'available', label: 'Boş' },
  { id: 'occupied', label: 'Aktif' },
  { id: 'payment', label: 'Ödeme' },
  { id: 'reserved', label: 'Rezerve' },
];

export function TableFilters({
  status,
  onStatusChange,
  group,
  onGroupChange,
  search,
  onSearchChange,
  groups,
  counts,
}: TableFiltersProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111827] p-3.5 shadow-[0_10px_26px_rgba(2,6,23,0.18)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onStatusChange(item.id)}
              className={status === item.id
                ? 'inline-flex h-10 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]'
                : 'inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-300 transition hover:bg-[#172033] hover:text-white'}
            >
              {item.label}
              <span className={status === item.id ? 'rounded-full bg-white/15 px-2 py-0.5 text-xs text-white' : 'rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-300'}>
                {counts[item.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={group}
            onChange={(event) => onGroupChange(event.target.value)}
            className="h-10 min-w-[160px] rounded-2xl border border-white/10 bg-[#0B1220] px-3.5 text-sm font-medium text-white outline-none"
          >
            <option value="all">Tüm gruplar</option>
            {groups.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Masa ara"
            className="h-10 min-w-[220px] rounded-2xl border border-white/10 bg-[#0B1220] px-3.5 text-sm font-medium text-white outline-none placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
