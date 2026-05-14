'use client';
import { useState } from 'react';

export function CTASection() {
  const [tab, setTab] = useState<'demo' | 'bayi'>('demo');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section id="demo" className="relative py-24 lg:py-32">
      {/* Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(14,165,233,0.07),transparent)]" aria-hidden />

      <div className="relative mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center mb-12">
          <p className="inline-flex rounded-full bg-brand-500/12 px-4 py-1.5 text-sm font-semibold text-brand-400 ring-1 ring-brand-500/25">
            Ücretsiz Demo
          </p>
          <h2 className="mt-5 text-4xl font-black text-white lg:text-5xl">
            Adisyum'u 30 dakikada keşfedin
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Uzman ekibimiz işletmenize özel canlı demo sunar. Sözleşme yok, kredi kartı gerekmez.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-8 flex gap-2 rounded-2xl border border-white/8 bg-white/3 p-1.5">
          {(['demo', 'bayi'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSent(false); }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                tab === t ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'demo' ? '🎯 Demo Talep Et' : '🤝 Bayi Başvurusu'}
            </button>
          ))}
        </div>

        {sent ? (
          <div className="glass-card rounded-3xl p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-emerald-400">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Talebiniz Alındı!</h3>
            <p className="mt-2 text-slate-400">Ekibimiz 1 iş günü içinde sizinle iletişime geçecek.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-8 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Ad Soyad" placeholder="Ahmet Yılmaz" required />
              <Field id="restaurant" label={tab === 'demo' ? 'Restoran / İşletme Adı' : 'Şirket Adı'} placeholder="Lezzet Restaurant" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phone" label="Telefon" type="tel" placeholder="+90 5xx xxx xx xx" required />
              <Field id="email" label="E-posta" type="email" placeholder="info@restoran.com" required />
            </div>
            {tab === 'demo' ? (
              <div>
                <label htmlFor="branches" className="mb-1.5 block text-xs font-semibold text-slate-400">Şube Sayısı</label>
                <select
                  id="branches"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50"
                >
                  <option value="1">1 şube</option>
                  <option value="2-5">2–5 şube</option>
                  <option value="6-20">6–20 şube</option>
                  <option value="20+">20+ şube</option>
                </select>
              </div>
            ) : (
              <Field id="region" label="Bölge / İl" placeholder="İstanbul, Avrupa Yakası" />
            )}
            <Field id="note" label="Not (isteğe bağlı)" placeholder="Özel gereksinimleriniz…" as="textarea" />
            <button
              type="submit"
              className="mt-2 rounded-2xl bg-brand-500 py-4 text-sm font-bold text-white shadow-[0_4px_24px_rgba(14,165,233,0.35)] transition hover:bg-brand-400 active:scale-[0.98]"
            >
              {tab === 'demo' ? 'Demo Talep Et →' : 'Bayi Başvurusu Gönder →'}
            </button>
            <p className="text-center text-xs text-slate-600">
              Gönder'e tıklayarak{' '}
              <a href="/gizlilik" className="underline hover:text-slate-400">Gizlilik Politikası</a>'nı kabul etmiş olursunuz.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function Field({
  id, label, placeholder, type = 'text', required = false, as = 'input',
}: {
  id: string; label: string; placeholder: string; type?: string; required?: boolean; as?: 'input' | 'textarea';
}) {
  const cls = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition';
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-400">{label}</label>
      {as === 'textarea' ? (
        <textarea id={id} rows={3} placeholder={placeholder} className={cls} />
      ) : (
        <input id={id} type={type} placeholder={placeholder} required={required} className={cls} />
      )}
    </div>
  );
}
