import { AppShell } from '@/components/app-shell';
import dynamic from 'next/dynamic';

const FinanceWorkspace = dynamic(() => import('@/components/finance-workspace').then((mod) => mod.FinanceWorkspace), {
  loading: () => <div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 text-sm text-slate-300">Finans yükleniyor...</div>,
});

export default function FinancePage() {
  return (
    <AppShell
      title="Finans"
      subtitle="Kasa, cari, stok ve ürünler, tahsilat ve kar/zarar işlemlerini ayrı finans pencerelerinde yönetin."
    >
      <FinanceWorkspace />
    </AppShell>
  );
}
