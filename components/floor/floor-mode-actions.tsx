'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, CalendarClock, LayoutGrid, Settings2 } from 'lucide-react';

type FloorTab = 'overview' | 'reservation' | 'setup' | 'report';

export function FloorModeActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get('tab') as FloorTab);
  const activeTab = active === 'reservation' || active === 'setup' || active === 'report' ? active : 'overview';

  function changeTab(tab: FloorTab) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => changeTab('overview')}
        className={activeTab === 'overview'
          ? 'inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]'
          : 'inline-flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033] hover:text-white'}
      >
        <LayoutGrid className="h-4 w-4" /> Masa görünümü
      </button>
      <button
        type="button"
        onClick={() => changeTab('reservation')}
        className={activeTab === 'reservation'
          ? 'inline-flex h-10 items-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(245,158,11,0.22)]'
          : 'inline-flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033] hover:text-white'}
      >
        <CalendarClock className="h-4 w-4" /> Rezervasyon
      </button>
      <button
        type="button"
        onClick={() => changeTab('setup')}
        className={activeTab === 'setup'
          ? 'inline-flex h-10 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]'
          : 'inline-flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033] hover:text-white'}
      >
        <Settings2 className="h-4 w-4" /> Masa tanımlama
      </button>
      <button
        type="button"
        onClick={() => changeTab('report')}
        className={activeTab === 'report'
          ? 'inline-flex h-10 items-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)]'
          : 'inline-flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033] hover:text-white'}
      >
        <BarChart3 className="h-4 w-4" /> Günlük rapor
      </button>
    </div>
  );
}



