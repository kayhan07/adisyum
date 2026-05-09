'use client';

import { useState } from 'react';
import { CheckCircle2, PlugZap, ShieldCheck, TestTube2, XCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';

type Provider = 'Uyumsoft' | 'Foriba' | 'EDM' | 'NES';
type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

const providers: Provider[] = ['Uyumsoft', 'Foriba', 'EDM', 'NES'];

export default function GibSettingsPage() {
  const [provider, setProvider] = useState<Provider>('Uyumsoft');
  const [companyCode, setCompanyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('mock://uyumsoft');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [message, setMessage] = useState('Henüz bağlantı testi yapılmadı.');

  async function testConnection() {
    setStatus('testing');
    setMessage('GİB entegratör bağlantısı test ediliyor...');

    try {
      const response = await fetch('/api/gib/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'default',
          provider,
          companyCode,
          username,
          password,
          apiKey,
          endpoint,
        }),
      });
      const payload = await response.json();
      setStatus(payload.success ? 'connected' : 'error');
      setMessage(payload.message || (payload.success ? 'Bağlantı başarılı.' : 'Bağlantı başarısız.'));
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'GİB bağlantısı test edilemedi.');
    }
  }

  return (
    <AppShell
      title="GİB entegrasyonu"
      subtitle="e-Fatura ve e-Arşiv entegratör bağlantılarını yönetin."
      backHref="/settings?tab=integrations"
      backLabel="Entegrasyonlara dön"
    >
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accentSoft text-accent">
              <PlugZap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">1. Provider Selection</p>
              <h2 className="text-xl font-semibold text-ink">Entegratör seçimi</h2>
            </div>
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-medium text-muted">GİB entegratörü</span>
            <select
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value as Provider;
                setProvider(nextProvider);
                setEndpoint(`mock://${nextProvider.toLocaleLowerCase('tr-TR')}`);
              }}
              className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
            >
              {providers.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm font-semibold text-ink">
            Seçilen entegratör: {provider}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">2. Connection Settings</p>
              <h2 className="text-xl font-semibold text-ink">Bağlantı bilgileri</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-muted">companyCode</span>
              <input value={companyCode} onChange={(event) => setCompanyCode(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted">username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted">password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted">apiKey</span>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-muted">endpoint URL</span>
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
            </label>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft xl:col-span-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                <TestTube2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">3. Test Connection</p>
                <h2 className="text-xl font-semibold text-ink">Bağlantı testi ve durum</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={testConnection}
              disabled={status === 'testing'}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'testing' ? 'Test ediliyor...' : 'Test Connection'}
            </button>
          </div>

          <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
            status === 'connected'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
              : status === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-800'
                : 'border-line bg-canvas text-ink'
          }`}>
            {status === 'connected' ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : status === 'error' ? <XCircle className="mt-0.5 h-5 w-5" /> : <TestTube2 className="mt-0.5 h-5 w-5" />}
            <div>
              <p className="font-semibold">Durum: {status === 'connected' ? 'Bağlı' : status === 'error' ? 'Hata' : status === 'testing' ? 'Test ediliyor' : 'Beklemede'}</p>
              <p className="mt-1 text-sm">{message}</p>
              <p className="mt-2 text-xs font-semibold opacity-80">Şifre ve API key sunucu tarafında şifrelenerek saklanır, ekrana geri döndürülmez.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
