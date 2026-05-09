import { ArrowUpRight, CircleAlert } from 'lucide-react';

type KpiCardProps = {
  label: string;
  value: string;
  delta: string;
  tone?: 'success' | 'warning' | 'neutral';
};

const toneStyles = {
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
  neutral: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
};

export function KpiCard({ label, value, delta, tone = 'neutral' }: KpiCardProps) {
  return (
    <div className="rounded-4xl border border-line bg-panel p-6 shadow-soft transition duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneStyles[tone]}`}>
          {tone === 'warning' ? <CircleAlert className="mr-1 h-3.5 w-3.5" /> : <ArrowUpRight className="mr-1 h-3.5 w-3.5" />}
          {delta}
        </div>
      </div>
    </div>
  );
}
