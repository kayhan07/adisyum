'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { DesktopSupportCenter } from '@/components/desktop-support-center';
import { authQueryKeys } from '@/lib/query/keys';
import { resetRuntimeAuthFailureLock, runtimeFetch } from '@/lib/runtime/runtime-api';
import { hydrateSessionStateFromAuth } from '@/lib/session-store';
import { setAuthSnapshotFromSession } from '@/lib/saas-store';
import { LEGACY_DEMO_TENANT_ID, purgeLegacyDemoTenantClientState, resetTenantBusinessCachesForLogin } from '@/lib/tenant-clean-start';
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

const REMEMBER_LOGIN_KEY = 'adisyum:remember-login';

export default function AppLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    purgeLegacyDemoTenantClientState();
    try {
      const remembered = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
      if (!remembered) return;
      const parsed = JSON.parse(remembered) as { tenantId?: string; username?: string };
      setTenantId(parsed.tenantId ?? '');
      setUsername(parsed.username ?? '');
      setRememberMe(Boolean(parsed.tenantId || parsed.username));
    } catch {
      window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      if (tenantId.trim() === LEGACY_DEMO_TENANT_ID) {
        setError(`${LEGACY_DEMO_TENANT_ID} silinmiş demo aboneliğidir. Lütfen gerçek abone kodu ile giriş yapın.`);
        return;
      }

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
      if (rememberMe) {
        window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({
          tenantId: tenantId.trim(),
          username: username.trim(),
        }));
      } else {
        window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }
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

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-[#0F172A]"
            />
            <span>
              <span className="block font-semibold">Beni hatırla</span>
              <span className="mt-1 block text-xs text-slate-400">Abone kodu ve kullanıcı adı bu cihazda hatırlanır. Şifreyi tarayıcının parola yöneticisi saklayabilir.</span>
            </span>
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
