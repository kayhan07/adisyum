'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { resetRuntimeAuthFailureLock, runtimeFetch } from '@/lib/runtime/runtime-api';

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

export default function SystemAdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await runtimeFetch('/api/auth/system-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? 'System-admin girişi başarısız.');
        return;
      }

      resetRuntimeAuthFailureLock();
      router.replace('/system-admin');
      window.location.assign('/system-admin');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'System-admin girişi sırasında hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B1220] p-6 text-white">
      <section className="w-full max-w-md rounded-[1.5rem] border border-white/15 bg-slate-800 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-blue-300" />
          <div>
            <h1 className="text-2xl font-semibold">System Admin</h1>
            <p className="mt-1 text-sm text-slate-300">Platform yönetim oturumu açın.</p>
          </div>
        </div>

        <form className="mt-6 grid gap-3" onSubmit={submit}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="admin password"
            className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
          />
          {error ? (
            <p className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="h-12 w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
          </button>
        </form>
      </section>
    </main>
  );
}
