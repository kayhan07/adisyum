import { CreditCard, Users } from 'lucide-react';

type TableCardProps = {
  name: string;
  group: string;
  status: 'available' | 'occupied' | 'delayed' | 'reserved';
  guests: number;
  total: number;
  onClick?: () => void;
};

const cardStyles: Record<TableCardProps['status'], string> = {
  available: 'border-slate-700 bg-[#111827] text-slate-100 hover:border-slate-500 hover:bg-[#172033]',
  occupied: 'border-sky-400/45 bg-[linear-gradient(180deg,#1d4ed8_0%,#1e3a8a_100%)] text-white hover:border-sky-300 hover:brightness-105',
  delayed: 'border-rose-400/55 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] text-white hover:border-rose-300 hover:brightness-105',
  reserved: 'border-amber-300/55 bg-[linear-gradient(180deg,#f59e0b_0%,#b45309_100%)] text-white hover:border-amber-200 hover:brightness-105',
};

const badgeStyles: Record<TableCardProps['status'], string> = {
  available: 'bg-slate-800 text-slate-200 ring-1 ring-slate-600/60',
  occupied: 'bg-white/15 text-white ring-1 ring-white/20',
  delayed: 'bg-white/12 text-white ring-1 ring-white/18',
  reserved: 'bg-white/14 text-white ring-1 ring-white/20',
};

const statusLabels: Record<TableCardProps['status'], string> = {
  available: 'Bos',
  occupied: 'Aktif',
  delayed: 'Gecikiyor',
  reserved: 'Rezerve',
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

function getShortCode(name: string) {
  const match = name.match(/(\d{2})$/);
  if (match) {
    const prefix = name.toLocaleUpperCase('tr').includes('SALON')
      ? 'S'
      : name.toLocaleUpperCase('tr').includes('TERAS')
        ? 'T'
        : name.toLocaleUpperCase('tr').includes('BAHÇE') || name.toLocaleUpperCase('tr').includes('BAHCE')
          ? 'B'
          : name.toLocaleUpperCase('tr').includes('VIP')
            ? 'V'
            : name.toLocaleUpperCase('tr').includes('BAR')
              ? 'R'
              : 'M';
    return `${prefix}-${match[1]}`;
  }

  return name.slice(0, 8);
}

export function TableCard({ name, group, status, guests, total, onClick }: TableCardProps) {
  const code = getShortCode(name);
  const showFinancialMeta = status !== 'available';

  return (
    <button
      onClick={onClick}
      className={`group relative h-full w-full min-h-[118px] rounded-[0.95rem] border p-3 text-left shadow-[0_10px_24px_rgba(2,6,23,0.22)] transition duration-150 hover:-translate-y-0.5 ${cardStyles[status]}`}
    >
      <div className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[1.05rem] font-bold tracking-tight">{code}</p>
            <p className={`mt-0.5 text-[11px] font-medium ${status === 'available' ? 'text-slate-400' : 'text-white/80'}`}>{group}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${badgeStyles[status]}`}>
            {statusLabels[status]}
          </span>
        </div>

        <div className="space-y-1.5">
          <p className={`truncate text-[12px] font-medium ${status === 'available' ? 'text-slate-300' : 'text-white/88'}`}>{name}</p>
          <div className={`flex items-center justify-between text-[11px] ${status === 'available' ? 'text-slate-400' : 'text-white/82'}`}>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {guests} misafir
            </span>
            {showFinancialMeta ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <CreditCard className="h-3 w-3" /> {formatMoney(total)}
              </span>
            ) : (
              <span className="font-semibold">Hazir</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}