'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export default function TenantLoginPage() {
  const [tenantId, setTenantId] = useState('ABN-48291');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState('');

  async function completeLogin() {
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        username,
        password,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setError('Kullanıcı adı veya şifre hatalı.');
      return;
    }

    window.location.href = '/app';
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_420px]">
        <section>
          <Link href="/site" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0F172A]">
            Siteye dön
          </Link>
          <p className="mt-12 text-xs font-semibold uppercase tracking-[0.45em] text-blue-200/70">Restoran POS / ERP</p>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
            Abone numaranızla güvenli giriş yapın.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Her abone kendi ürün, kasa, sipariş, yazıcı ve kullanıcı bilgileriyle ayrı çalışır. Bilgiler aboneler arasında karışmaz.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {['Tenant ayrımı', 'Rol bazlı yetki', 'Modül kontrolü'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-sm font-semibold text-white">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-white/15 bg-slate-800 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold text-white">Uygulama girişi</h2>
              <p className="mt-1 text-sm text-slate-300">Abone numarası, kullanıcı adı ve şifre ile devam edin.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Abone numarası</span>
              <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none focus:border-blue-400" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Kullanıcı adı</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none focus:border-blue-400" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Şifre</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none focus:border-blue-400" />
            </label>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">{error}</div> : null}

          <button type="button" onClick={completeLogin} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-semibold text-white transition hover:-translate-y-0.5">
            Giriş yap <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-xs font-semibold text-slate-400">System admin paneli bu ekranda görünmez, yalnızca direkt URL ile erişilir.</p>
        </section>
      </div>
    </main>
  );
}
