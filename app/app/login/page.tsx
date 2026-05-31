'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { DesktopSupportCenter } from '@/components/desktop-support-center';
import { authQueryKeys } from '@/lib/query/keys';
import { resetRuntimeAuthFailureLock, runtimeFetch } from '@/lib/runtime/runtime-api';
import { hydrateSessionStateFromAuth } from '@/lib/session-store';
import { setAuthSnapshotFromSession } from '@/lib/saas-store';
import { resetTenantBusinessCachesForLogin } from '@/lib/tenant-clean-start';
import { hydrateCompanyStateFromTenantProfile, type TenantCompanyProfile } from '@/lib/company-store';

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

type AuthMeResponse = {
  ok: true;
  session: {
    tenantId: string;
    role: string;
    branchId?: string;
    packageType?: 'mini' | 'gold' | 'premium';
    subscriptionEndDate?: string;
    username?: string;
    name?: string;
    companyProfile?: TenantCompanyProfile;
  };
} | {
  ok: false;
  error?: string;
};

export default function AppLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await runtimeFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          username: username.trim(),
          password,
        }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? 'Giris basarisiz.');
        return;
      }

      resetRuntimeAuthFailureLock();
      const sessionResponse = await runtimeFetch('/api/auth/me', { cache: 'no-store' });
      const sessionPayload = (await sessionResponse.json().catch(() => null)) as AuthMeResponse | null;

      if (!sessionResponse.ok || !sessionPayload?.ok) {
        setError('Oturum dogrulanamadi. Lutfen tekrar deneyin.');
        return;
      }

      hydrateSessionStateFromAuth(sessionPayload.session);
      setAuthSnapshotFromSession(sessionPayload.session);
      resetTenantBusinessCachesForLogin(sessionPayload.session.tenantId);
      hydrateCompanyStateFromTenantProfile(sessionPayload.session.companyProfile);
      queryClient.setQueryData(authQueryKeys.session(), sessionPayload);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });
      router.replace('/app');
      window.location.assign('/app');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Giris sirasinda hata olustu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0F172A] px-4 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-6 lg:grid-cols-[minmax(360px,420px)_1fr]">
      <section className="w-full rounded-[1.5rem] border border-white/10 bg-[#111C30] p-6 shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500 text-white">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Adisyum giris</h1>
            <p className="mt-1 text-sm text-slate-300">Oturum acarak modul merkezine devam edin.</p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Tenant
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              autoComplete="organization"
              className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-blue-300"
              placeholder="ABN-..."
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Kullanici adi
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-blue-300"
              placeholder="admin"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Sifre
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              type="password"
              className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-blue-300"
              placeholder="••••"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? 'Giris yapiliyor...' : 'Giris yap'}
          </button>
        </form>
      </section>
      <DesktopSupportCenter />
      </div>
    </main>
  );
}
