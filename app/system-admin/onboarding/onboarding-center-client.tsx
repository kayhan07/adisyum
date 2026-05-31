'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

type ProvisioningJob = {
  id: string;
  targetTenantId: string;
  status: string;
  currentStep: string;
  attemptCount: number;
  failureReason?: string | null;
};

type WizardStep =
  | 'company'
  | 'package'
  | 'branch'
  | 'users'
  | 'starter'
  | 'finance'
  | 'preview'
  | 'provisioning';

type AdvancedTab = 'jobs' | 'failed' | 'retry' | 'rollback' | 'health';

const wizardSteps: Array<{ id: WizardStep; label: string }> = [
  { id: 'company', label: 'Firma Bilgileri' },
  { id: 'package', label: 'Paket Seçimi' },
  { id: 'branch', label: 'Şube Yapısı' },
  { id: 'users', label: 'Kullanıcılar' },
  { id: 'starter', label: 'Başlangıç' },
  { id: 'finance', label: 'Finans' },
  { id: 'preview', label: 'Önizleme' },
  { id: 'provisioning', label: 'Kurulum' },
];

export default function OnboardingCenterClient() {
  const [activeStep, setActiveStep] = useState<WizardStep>('company');
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>('jobs');
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    taxInfo: '',
    notes: '',
    packageType: 'mini' as 'mini' | 'gold' | 'premium',
    branchCount: 1,
    restaurantType: 'cafe',
    tableModel: 'standard',
    serviceModel: 'table',
    adminUsername: 'admin',
    adminPassword: '',
    starterPack: 'empty',
    startDate: '',
    packageFee: 0,
    reseller: '',
    commissionRate: 0,
    autoRenew: true,
    paymentType: 'monthly',
  });

  async function loadJobs() {
    try {
      const response = await fetch('/api/system-admin/tenants', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { jobs?: ProvisioningJob[] } | null;
      setJobs(payload?.jobs ?? []);
    } catch (error) {
      console.error('[system-admin/onboarding] jobs load failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  useEffect(() => { void loadJobs(); }, []);

  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const currentStepIndex = wizardSteps.findIndex((step) => step.id === activeStep);
  const previewRows = useMemo(() => [
    `1 firma kaydı: ${draft.companyName || '-'}`,
    `${draft.branchCount} şube`,
    `1 yönetici kullanıcı: ${draft.adminUsername || '-'}`,
    `Paket: ${packageLabel(draft.packageType)}`,
    `Başlangıç: ${starterLabel(draft.starterPack)}`,
    `Yenileme: ${draft.autoRenew ? 'Otomatik' : 'Manuel'}`,
  ], [draft]);

  function updateDraft<Key extends keyof typeof draft>(key: Key, value: (typeof draft)[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function goNext() {
    setActiveStep(wizardSteps[Math.min(currentStepIndex + 1, wizardSteps.length - 1)].id);
  }

  function goBack() {
    setActiveStep(wizardSteps[Math.max(currentStepIndex - 1, 0)].id);
  }

  async function createSubscription() {
    if (submitting) return;
    if (!draft.companyName.trim() || !draft.adminUsername.trim() || !draft.adminPassword.trim()) {
      setMessage('Firma adı, admin kullanıcı adı ve şifre zorunlu.');
      return;
    }
    setMessage('');
    setSubmitting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/system-admin/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          companyName: draft.companyName.trim(),
          legalName: draft.companyName.trim(),
          taxNumber: draft.taxInfo.trim() || undefined,
          phone: draft.phone.trim() || undefined,
          email: draft.email.trim() || undefined,
          contactName: draft.contactName.trim() || undefined,
          address: draft.address.trim() || undefined,
          notes: draft.notes.trim() || undefined,
          adminEmail: draft.email.trim() || undefined,
          adminName: draft.contactName.trim() || 'Tenant Admin',
          adminUsername: draft.adminUsername.trim(),
          adminPassword: draft.adminPassword,
          packageType: draft.packageType,
          billingPeriod: draft.paymentType,
          startsAt: draft.startDate || undefined,
          branchId: 'mrk',
          branchName: draft.branchCount > 1 ? 'Merkez Şube' : 'Merkez Şube',
          initialBalance: 0,
          kontorBalance: 0,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string | null; queued?: boolean } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? 'Abonelik oluşturulamadı. Lütfen bilgileri kontrol edip tekrar deneyin.');
        return;
      }
      setMessage(payload?.queued === false
        ? `Kurulum işi oluşturuldu fakat kuyruk beklemede. ${payload.warning ?? ''}`.trim()
        : 'Kurulum başlatıldı. Süreci aşağıdaki durum akışından izleyebilirsiniz.');
      setActiveStep('provisioning');
      await loadJobs();
    } catch (error) {
      console.error('[system-admin/onboarding] subscription creation failed', {
        companyName: draft.companyName,
        error: error instanceof Error ? error.message : String(error),
      });
      setMessage(error instanceof Error && error.name === 'AbortError'
        ? 'Abonelik oluşturma isteği zaman aşımına uğradı. Ekran kilitlenmedi; kurulum işlerini kontrol edin.'
        : 'Abonelik oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
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

  return <main className="min-h-screen bg-[#08111f] p-6 text-white">
    <header className="mx-auto max-w-6xl">
      <Link href="/system-admin" className="text-sm text-slate-400">← Kontrol Merkezi</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Onboarding Merkezi</h1>
          <p className="mt-2 text-sm text-slate-400">Yeni müşteriyi dakikalar içinde canlı kullanıma hazırlayan adım adım kurulum akışı.</p>
        </div>
        <Link href="/system-admin" className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200">Aboneliklere dön</Link>
      </div>
    </header>

    <section className="mx-auto mt-6 grid max-w-6xl gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-white/10 bg-white/[0.025] p-3">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kurulum Adımları</p>
        <nav className="grid gap-1">
          {wizardSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              disabled={submitting}
              className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm disabled:opacity-60 ${activeStep === step.id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs">{index + 1}</span>
              {step.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="grid gap-5">
        <article className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          {activeStep === 'company' ? <CompanyStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'package' ? <PackageStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'branch' ? <BranchStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'users' ? <UsersStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'starter' ? <StarterStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'finance' ? <FinanceStep draft={draft} updateDraft={updateDraft} /> : null}
          {activeStep === 'preview' ? <PreviewStep rows={previewRows} /> : null}
          {activeStep === 'provisioning' ? <ProvisioningStep jobs={jobs} message={message} /> : null}
          {message && activeStep !== 'provisioning' ? <p className="mt-5 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{message}</p> : null}
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5">
            <button type="button" onClick={goBack} disabled={submitting || currentStepIndex === 0} className="rounded-2xl border border-white/10 px-4 py-3 text-sm disabled:opacity-40">Geri</button>
            {activeStep === 'preview' ? (
              <button type="button" disabled={submitting} onClick={() => void createSubscription()} className="rounded-2xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-60">{submitting ? 'Kurulum başlatılıyor…' : 'Kurulumu Başlat'}</button>
            ) : activeStep !== 'provisioning' ? (
              <button type="button" disabled={submitting} onClick={goNext} className="rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-60">Devam Et</button>
            ) : null}
          </div>
        </article>

        <details className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Gelişmiş Operasyon Araçları</summary>
          <p className="mt-2 text-sm text-slate-400">Destek ekibinin başarısız kurulumları incelemek, yeniden denemek veya geri almak için kullandığı teknik alan.</p>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {([
              ['jobs', 'Kurulum İşleri'],
              ['failed', 'Başarısız İşlemler'],
              ['retry', 'Tekrar Deneme'],
              ['rollback', 'Geri Alma'],
              ['health', 'Sağlık Kontrolü'],
            ] as Array<[AdvancedTab, string]>).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setAdvancedTab(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${advancedTab === id ? 'bg-white/10 text-white' : 'text-slate-400'}`}>{label}</button>
            ))}
          </div>
          {advancedTab === 'jobs' ? <JobCards jobs={jobs} /> : null}
          {advancedTab === 'failed' ? <JobCards jobs={failedJobs} /> : null}
          {advancedTab === 'retry' ? <ActionCards jobs={failedJobs} action="retry" onAction={runAction} /> : null}
          {advancedTab === 'rollback' ? <ActionCards jobs={jobs.filter((job) => job.status !== 'completed')} action="rollback" onAction={runAction} /> : null}
          {advancedTab === 'health' ? <EmptyPanel title="Sağlık Kontrolü" text={`${jobs.length} kurulum işi izleniyor, ${failedJobs.length} başarısız işlem var.`} /> : null}
        </details>
      </div>
    </section>
  </main>;
}

function CompanyStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Firma Bilgileri" text="Müşteriyle ilgili ticari ve iletişim bilgilerini toplayın.">
    <div className="grid gap-3 md:grid-cols-2">
      <Field value={draft.companyName} onChange={(value) => updateDraft('companyName', value)} placeholder="Firma adı" />
      <Field value={draft.contactName} onChange={(value) => updateDraft('contactName', value)} placeholder="Yetkili kişi" />
      <Field value={draft.phone} onChange={(value) => updateDraft('phone', value)} placeholder="Telefon" />
      <Field value={draft.email} onChange={(value) => updateDraft('email', value)} placeholder="E-posta" />
      <Field value={draft.address} onChange={(value) => updateDraft('address', value)} placeholder="Adres" className="md:col-span-2" />
      <Field value={draft.taxInfo} onChange={(value) => updateDraft('taxInfo', value)} placeholder="Vergi bilgileri" />
      <Field value={draft.notes} onChange={(value) => updateDraft('notes', value)} placeholder="Notlar" />
    </div>
  </StepShell>;
}

function PackageStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Paket Seçimi" text="İşletmenin ölçeğine uygun lisans paketini seçin.">
    <div className="grid gap-3 md:grid-cols-3">
      {(['mini', 'gold', 'premium'] as const).map((packageType) => (
        <button key={packageType} type="button" onClick={() => updateDraft('packageType', packageType)} className={`rounded-2xl border p-4 text-left ${draft.packageType === packageType ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025]'}`}>
          <p className="text-lg font-semibold">{packageLabel(packageType)}</p>
          <p className="mt-2 text-sm text-slate-400">{packageType === 'mini' ? 'Tek şube başlangıcı' : packageType === 'gold' ? 'Büyüyen restoranlar' : 'Çok şubeli yapı'}</p>
        </button>
      ))}
    </div>
  </StepShell>;
}

function BranchStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Şube Yapısı" text="Restoran tipini ve hizmet modelini belirleyin.">
    <div className="grid gap-3 md:grid-cols-2">
      <NumberField value={draft.branchCount} onChange={(value) => updateDraft('branchCount', value)} placeholder="Şube sayısı" />
      <Select value={draft.restaurantType} onChange={(value) => updateDraft('restaurantType', value)} options={[['cafe', 'Cafe'], ['kebap', 'Kebapçı'], ['meyhane', 'Meyhane'], ['fish', 'Balık Restoranı']]} />
      <Select value={draft.tableModel} onChange={(value) => updateDraft('tableModel', value)} options={[['standard', 'Standart masa yapısı'], ['fast', 'Hızlı servis'], ['mixed', 'Karma yapı']]} />
      <Select value={draft.serviceModel} onChange={(value) => updateDraft('serviceModel', value)} options={[['table', 'Masaya servis'], ['takeaway', 'Paket servis'], ['mixed', 'Karma servis']]} />
    </div>
  </StepShell>;
}

function UsersStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Kullanıcılar" text="İlk yönetici hesabını oluşturun.">
    <div className="grid gap-3 md:grid-cols-2">
      <Field value={draft.adminUsername} onChange={(value) => updateDraft('adminUsername', value)} placeholder="Admin kullanıcı adı" />
      <Field type="password" value={draft.adminPassword} onChange={(value) => updateDraft('adminPassword', value)} placeholder="İlk şifre" />
    </div>
  </StepShell>;
}

function StarterStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Template / Başlangıç" text="İşletmenin başlangıç verisini seçin.">
    <div className="grid gap-3 md:grid-cols-2">
      {(['empty', 'cafe', 'kebap', 'meyhane', 'fish', 'custom'] as const).map((pack) => (
        <button key={pack} type="button" onClick={() => updateDraft('starterPack', pack)} className={`rounded-2xl border p-4 text-left ${draft.starterPack === pack ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025]'}`}>
          <p className="font-semibold">{starterLabel(pack)}</p>
        </button>
      ))}
    </div>
  </StepShell>;
}

function FinanceStep({ draft, updateDraft }: StepProps) {
  return <StepShell title="Finans" text="Satış ve yenileme koşullarını tanımlayın.">
    <div className="grid gap-3 md:grid-cols-2">
      <Field type="date" value={draft.startDate} onChange={(value) => updateDraft('startDate', value)} placeholder="Başlangıç tarihi" />
      <NumberField value={draft.packageFee} onChange={(value) => updateDraft('packageFee', value)} placeholder="Paket ücreti" />
      <Field value={draft.reseller} onChange={(value) => updateDraft('reseller', value)} placeholder="Bayi / temsilci" />
      <NumberField value={draft.commissionRate} onChange={(value) => updateDraft('commissionRate', value)} placeholder="Komisyon %" />
      <Select value={draft.paymentType} onChange={(value) => updateDraft('paymentType', value)} options={[['monthly', 'Aylık'], ['quarterly', '3 Aylık'], ['yearly', 'Yıllık']]} />
      <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm">
        Otomatik yenileme
        <input type="checkbox" checked={draft.autoRenew} onChange={(event) => updateDraft('autoRenew', event.target.checked)} />
      </label>
    </div>
  </StepShell>;
}

function PreviewStep({ rows }: { rows: string[] }) {
  return <StepShell title="Önizleme" text="Kurulum başlamadan önce oluşturulacak yapıyı doğrulayın.">
    <div className="grid gap-2">
      {rows.map((row) => <p key={row} className="rounded-2xl bg-white/[0.035] px-4 py-3 text-sm text-slate-200">{row}</p>)}
    </div>
  </StepShell>;
}

function ProvisioningStep({ jobs, message }: { jobs: ProvisioningJob[]; message: string }) {
  return <StepShell title="Kurulum" text="Müşteri hesabı hazırlanırken ilerlemeyi sade biçimde izleyin.">
    {message ? <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
    <JobCards jobs={jobs.slice(0, 4)} />
  </StepShell>;
}

type StepProps = {
  draft: {
    companyName: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    taxInfo: string;
    notes: string;
    packageType: 'mini' | 'gold' | 'premium';
    branchCount: number;
    restaurantType: string;
    tableModel: string;
    serviceModel: string;
    adminUsername: string;
    adminPassword: string;
    starterPack: string;
    startDate: string;
    packageFee: number;
    reseller: string;
    commissionRate: number;
    autoRenew: boolean;
    paymentType: string;
  };
  updateDraft: <Key extends keyof StepProps['draft']>(key: Key, value: StepProps['draft'][Key]) => void;
};

function StepShell({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return <>
    <h2 className="text-xl font-semibold">{title}</h2>
    <p className="mt-2 text-sm text-slate-400">{text}</p>
    <div className="mt-5">{children}</div>
  </>;
}

function Field({ value, onChange, placeholder, type = 'text', className = '' }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string; className?: string }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none ${className}`} />;
}

function NumberField({ value, onChange, placeholder }: { value: number; onChange: (value: number) => void; placeholder: string }) {
  return <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} placeholder={placeholder} className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none" />;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none">
    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>;
}

function JobCards({ jobs }: { jobs: ProvisioningJob[] }) {
  return <div className="mt-5 grid gap-3">{jobs.map((job) => <article key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold">{job.targetTenantId}</p><p className="mt-1 text-sm text-slate-400">{job.status} / {job.currentStep} / deneme {job.attemptCount}</p></article>)}</div>;
}

function ActionCards({ jobs, action, onAction }: { jobs: ProvisioningJob[]; action: 'retry' | 'rollback'; onAction: (jobId: string, action: 'retry' | 'rollback') => Promise<void> }) {
  return <div className="mt-5 grid gap-3">{jobs.map((job) => <article key={job.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div><p className="font-semibold">{job.targetTenantId}</p><p className="text-sm text-slate-400">{job.failureReason ?? job.currentStep}</p></div><button type="button" onClick={() => void onAction(job.id, action)} className="rounded-xl bg-white/10 px-3 py-2 text-sm">{action === 'retry' ? 'Tekrar Dene' : 'Geri Al'}</button></article>)}</div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <article className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-400">{text}</p></article>;
}

function packageLabel(value: 'mini' | 'gold' | 'premium') {
  if (value === 'gold') return 'Premium';
  if (value === 'premium') return 'Enterprise';
  return 'Mini';
}

function starterLabel(value: string) {
  const labels: Record<string, string> = {
    empty: 'Boş sistem',
    cafe: 'Cafe starter',
    kebap: 'Kebapçı starter',
    meyhane: 'Meyhane',
    fish: 'Balık restoranı',
    custom: 'Özel template',
  };
  return labels[value] ?? value;
}
