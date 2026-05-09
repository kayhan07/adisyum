'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { loadBranchState, subscribeToBranchChanges, type BranchRecord } from '@/lib/branch-store';

type DerivedPlan = {
  tenant: string;
  plan: string;
  status: string;
  mrr: string;
  scope: string;
};

export default function SaasPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);

  useEffect(() => {
    const refresh = () => {
      setBranches(loadBranchState().branches);
    };

    refresh();
    const unsubscribe = subscribeToBranchChanges(refresh);
    return () => {
      unsubscribe();
    };
  }, []);

  const subscriptionPlans = useMemo<DerivedPlan[]>(
    () => branches.map((branch, index) => ({
      tenant: branch.name,
      plan: index === 0 ? 'Chain Pro' : 'Branch Plus',
      status: 'Aktif',
      mrr: index === 0 ? 'TRY 4,500' : 'TRY 1,250',
      scope: index === 0 ? 'Merkezi faturalama' : `${branch.type} kapsamı`,
    })),
    [branches],
  );

  const totalMrr = useMemo(
    () => subscriptionPlans
      .reduce((sum, plan) => sum + Number(plan.mrr.replace(/[^0-9,]/g, '').replace(',', '.')), 0)
      .toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }),
    [subscriptionPlans],
  );

  const centralCount = useMemo(() => Math.min(1, branches.length), [branches.length]);
  const branchCount = useMemo(() => Math.max(0, branches.length - centralCount), [branches.length, centralCount]);

  return (
    <AppShell
      title="SaaS faturalama ve şube abonelikleri"
      subtitle="Merkezi faturalama ile şube bazlı abonelikleri aynı panelden yönetin. Hangi şubenin merkezden kapsandığını, hangisinin ayrı ücretlendiğini ve toplam MRR etkisini birlikte görün."
      actions={<a href="#abonelik-listesi" className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">Abonelik Listesine Git</a>}
    >
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Aylık tekrarlayan gelir özeti</p>
          <p className="mt-4 text-4xl font-semibold text-ink">{totalMrr}</p>
          <p className="mt-2 text-sm text-muted">Şube kayıtlarından türetilen aktif abonelik görünümü. Merkez ve şube planlarını birlikte izlersin.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-line bg-canvas p-4">
              <p className="text-sm text-muted">Merkezi faturalama</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{centralCount} şube</p>
            </div>
            <div className="rounded-3xl border border-line bg-canvas p-4">
              <p className="text-sm text-muted">Şube bazlı plan</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{branchCount} şube</p>
            </div>
          </div>
        </div>
        <div id="abonelik-listesi" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Abonelik listesi</p>
          <div className="mt-4 space-y-3">
            {subscriptionPlans.map((plan) => (
              <div key={plan.tenant} className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-canvas px-4 py-4 md:flex-row md:items-center">
                <div>
                  <p className="font-semibold text-ink">{plan.tenant}</p>
                  <p className="text-sm text-muted">{plan.plan} · {plan.scope}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{plan.status}</span>
                  <span className="font-semibold text-ink">{plan.mrr}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}