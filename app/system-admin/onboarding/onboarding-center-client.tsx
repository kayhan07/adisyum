'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type ProvisioningJob = { id: string; targetTenantId: string; status: string; currentStep: string; attemptCount: number; failureReason?: string | null };
type TabId = 'new' | 'jobs' | 'failed' | 'retry' | 'rollback' | 'templates' | 'health';

export default function OnboardingCenterClient() {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [packageType, setPackageType] = useState<'mini' | 'gold' | 'premium'>('mini');
  const [message, setMessage] = useState('');

  async function loadJobs() {
    const response = await fetch('/api/system-admin/tenants', { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null) as { jobs?: ProvisioningJob[] } | null;
    setJobs(payload?.jobs ?? []);
  }

  useEffect(() => { void loadJobs(); }, []);

  async function createSubscription() {
    setMessage('');
    const response = await fetch('/api/system-admin/tenants', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName, adminUsername, adminPassword, packageType }),
    });
    if (!response.ok) {
      setMessage('Abonelik oluşturulamadı.');
      return;
    }
    setMessage('Provisioning kuyruğa alındı.');
    setCompanyName('');
    setAdminPassword('');
    await loadJobs();
  }

  async function runAction(jobId: string, action: 'retry' | 'rollback') {
    await fetch('/api/system-admin/tenants', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, action }),
    });
    await loadJobs();
  }

  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const tabs: Array<[TabId, string]> = [
    ['new', 'Yeni Abonelik'],
    ['jobs', 'Provisioning İşleri'],
    ['failed', 'Başarısız İşlemler'],
    ['retry', 'Retry Merkezi'],
    ['rollback', 'Rollback Merkezi'],
    ['templates', 'Template Import'],
    ['health', 'Sağlık Kontrolü'],
  ];

  return <main className="min-h-screen bg-[#08111f] p-6 text-white">
    <header className="mx-auto max-w-6xl">
      <Link href="/system-admin" className="text-sm text-slate-400">← Kontrol Merkezi</Link>
      <h1 className="mt-3 text-3xl font-semibold">Onboarding Merkezi</h1>
      <p className="mt-2 text-sm text-slate-400">Abonelik oluşturma, provisioning ve kurtarma akışları tek çalışma alanında.</p>
    </header>
    <section className="mx-auto mt-6 max-w-6xl">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025] p-2">
        {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${activeTab === id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}>{label}</button>)}
      </div>
      {activeTab === 'new' ? <article className="mt-5 max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Yeni abonelik oluştur</h2>
        <div className="mt-5 grid gap-3">
          <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Firma adı" className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none" />
          <div className="grid gap-3 md:grid-cols-2">
            <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} placeholder="Admin kullanıcı adı" className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none" />
            <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="İlk şifre" className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none" />
          </div>
          <select value={packageType} onChange={(event) => setPackageType(event.target.value as typeof packageType)} className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none">
            <option value="mini">Mini</option><option value="gold">Gold</option><option value="premium">Premium</option>
          </select>
        </div>
        <button type="button" onClick={() => void createSubscription()} className="mt-5 rounded-2xl bg-emerald-500/20 px-4 py-3 font-semibold text-emerald-100">Yeni Abonelik Oluştur</button>
        {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
      </article> : null}
      {activeTab === 'jobs' ? <JobCards jobs={jobs} /> : null}
      {activeTab === 'failed' ? <JobCards jobs={failedJobs} /> : null}
      {activeTab === 'retry' ? <ActionCards jobs={failedJobs} action="retry" onAction={runAction} /> : null}
      {activeTab === 'rollback' ? <ActionCards jobs={jobs.filter((job) => job.status !== 'completed')} action="rollback" onAction={runAction} /> : null}
      {activeTab === 'templates' ? <EmptyPanel title="Template Import" text="Template import akışları bu yüzeyde izole edilir." /> : null}
      {activeTab === 'health' ? <EmptyPanel title="Sağlık Kontrolü" text={`${jobs.length} provisioning işi izleniyor, ${failedJobs.length} başarısız iş var.`} /> : null}
    </section>
  </main>;
}

function JobCards({ jobs }: { jobs: ProvisioningJob[] }) {
  return <div className="mt-5 grid gap-3">{jobs.map((job) => <article key={job.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4"><p className="font-semibold">{job.targetTenantId}</p><p className="mt-1 text-sm text-slate-400">{job.status} / {job.currentStep} / deneme {job.attemptCount}</p></article>)}</div>;
}
function ActionCards({ jobs, action, onAction }: { jobs: ProvisioningJob[]; action: 'retry' | 'rollback'; onAction: (jobId: string, action: 'retry' | 'rollback') => Promise<void> }) {
  return <div className="mt-5 grid gap-3">{jobs.map((job) => <article key={job.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900 p-4"><div><p className="font-semibold">{job.targetTenantId}</p><p className="text-sm text-slate-400">{job.failureReason ?? job.currentStep}</p></div><button type="button" onClick={() => void onAction(job.id, action)} className="rounded-xl bg-white/10 px-3 py-2 text-sm">{action === 'retry' ? 'Tekrar Dene' : 'Rollback'}</button></article>)}</div>;
}
function EmptyPanel({ title, text }: { title: string; text: string }) { return <article className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-400">{text}</p></article>; }
