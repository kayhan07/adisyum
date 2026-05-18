'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type SubscriptionRow = {
  tenantId: string;
  companyName: string;
  status: string;
  plan: string;
  billingPeriod: string;
  branchCount: number;
  activeBranchCount: number;
  activeUsers: number;
  dailyRevenue: number;
  expiresAt?: string | null;
  createdAt?: string | null;
};

type TabId = 'overview' | 'license' | 'users' | 'branches' | 'devices' | 'finance' | 'invoices' | 'payments' | 'activity' | 'ai' | 'settings';

const tabs: Array<[TabId, string]> = [
  ['overview', 'Genel Bilgiler'],
  ['license', 'Paket & Lisans'],
  ['users', 'Kullanıcılar'],
  ['branches', 'Şubeler'],
  ['devices', 'Cihazlar'],
  ['finance', 'Finans'],
  ['invoices', 'Faturalar'],
  ['payments', 'Ödeme Geçmişi'],
  ['activity', 'Aktivite Logları'],
  ['ai', 'AI Analiz'],
  ['settings', 'Ayarlar'],
];

export default function SubscriptionDetailClient({ subscriptionId }: { subscriptionId: string }) {
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch('/api/system-admin/tenants', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { tenants?: SubscriptionRow[] } | null;
      if (!cancelled) {
        setSubscription(payload?.tenants?.find((item) => item.tenantId === subscriptionId) ?? null);
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [subscriptionId]);

  const summaryRows = useMemo(() => subscription ? [
    ['Firma', subscription.companyName],
    ['Abonelik No', subscription.tenantId],
    ['Durum', subscription.status],
    ['Paket', subscription.plan],
    ['Yenileme', subscription.expiresAt?.slice(0, 10) ?? '-'],
    ['Oluşturulma', subscription.createdAt?.slice(0, 10) ?? '-'],
  ] : [], [subscription]);

  if (loading) return <main className="min-h-screen bg-[#08111f] p-6 text-white">Abonelik yükleniyor...</main>;
  if (!subscription) return <main className="min-h-screen bg-[#08111f] p-6 text-white">Abonelik bulunamadı.</main>;

  return <main className="min-h-screen bg-[#08111f] p-6 text-white">
    <div className="mx-auto max-w-6xl">
      <Link href="/system-admin" className="text-sm text-slate-400">← Abonelikler</Link>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{subscription.companyName}</h1>
          <p className="mt-2 text-sm text-slate-400">{subscription.tenantId} / {subscription.plan}</p>
        </div>
        <Link href={`/system-admin/tenants/${subscription.tenantId}`} className="rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100">Operasyon Alanını Aç</Link>
      </header>

      <div className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025] p-2">
        {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${activeTab === id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}>{label}</button>)}
      </div>

      <section className="mt-5">
        {activeTab === 'overview' ? <div className="grid gap-4 md:grid-cols-2">
          {summaryRows.map(([label, value]) => <InfoCard key={label} label={label} value={value} />)}
        </div> : null}
        {activeTab === 'license' ? <ListPanel title="Paket & Lisans" rows={[`Paket: ${subscription.plan}`, `Dönem: ${subscription.billingPeriod}`, `Yenileme: ${subscription.expiresAt?.slice(0, 10) ?? '-'}`]} /> : null}
        {activeTab === 'users' ? <ListPanel title="Kullanıcılar" rows={[`${subscription.activeUsers} aktif kullanıcı`]} /> : null}
        {activeTab === 'branches' ? <ListPanel title="Şubeler" rows={[`${subscription.activeBranchCount}/${subscription.branchCount} aktif şube`]} /> : null}
        {activeTab === 'devices' ? <ListPanel title="Cihazlar" rows={['Cihaz envanteri operasyon alanından izlenir.']} /> : null}
        {activeTab === 'finance' ? <ListPanel title="Finans" rows={[`Bugünkü ciro: ₺${subscription.dailyRevenue.toLocaleString('tr-TR')}`]} /> : null}
        {activeTab === 'invoices' ? <ListPanel title="Faturalar" rows={['Fatura geçmişi bu alanda listelenir.']} /> : null}
        {activeTab === 'payments' ? <ListPanel title="Ödeme Geçmişi" rows={['Tahsilat geçmişi bu alanda listelenir.']} /> : null}
        {activeTab === 'activity' ? <ListPanel title="Aktivite Logları" rows={['Abonelik hareketleri bu alanda izlenir.']} /> : null}
        {activeTab === 'ai' ? <ListPanel title="AI Analiz" rows={['Risk, yenileme ve büyüme önerileri burada gösterilir.']} /> : null}
        {activeTab === 'settings' ? <ListPanel title="Ayarlar" rows={['Abonelik ayarları kontrollü biçimde yönetilir.']} /> : null}
      </section>
    </div>
  </main>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></article>;
}

function ListPanel({ title, rows }: { title: string; rows: string[] }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 grid gap-2">{rows.map((row) => <p key={row} className="rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-300">{row}</p>)}</div></article>;
}
