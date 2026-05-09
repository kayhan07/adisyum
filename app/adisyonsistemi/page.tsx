'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { getDefaultAccessState, loadAccessState } from '@/lib/access-store';
import { createAuthToken, findTenant, findTenantCredential, isTenantSubscriptionActive, listTenantCredentials, type TenantRecord } from '@/lib/saas-store';
import { getDefaultSessionState, saveSessionState } from '@/lib/session-store';
import { activateTenantRuntime } from '@/lib/tenant-runtime-store';

const DEMO_TENANT: TenantRecord = {
  id: 'ten-demo',
  tenant_id: 'ABN-48291',
  name: 'Adisyon Demo Bistro',
  package_id: 'pkg-premium',
  package_type: 'premium',
  start_date: '2026-01-01',
  end_date: '2027-01-01',
  demo_enabled: true,
  status: 'demo',
  main_branch_id: 'mrk',
  created_at: '2026-01-01T00:00:00.000Z',
};

const DEMO_ADMIN = {
  id: 'usr-demo-admin',
  name: 'Admin',
  username: 'admin',
  password: '1234',
  role: 'Admin',
  branchId: 'mrk',
  active: true,
  permissions: ['orders.create', 'orders.edit', 'orders.cancel', 'pricing.manage', 'payments.take', 'reports.view', 'settings.manage'],
};

export default function TenantLoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('ABN-48291');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState('');

  function completeLogin() {
    setError('');

    const normalizedTenantId = tenantId.trim().toLocaleLowerCase('tr-TR');
    const normalizedUsername = username.trim().toLocaleLowerCase('tr-TR');
    const tenant = findTenant(tenantId) ?? (normalizedTenantId === 'abn-48291' ? DEMO_TENANT : null);

    if (!tenant) {
      setError('Abone numarası bulunamadı.');
      return;
    }

    if (!isTenantSubscriptionActive(tenant)) {
      setError('Abonelik süresi dolduğu için giriş yapılamaz.');
      return;
    }

    const access = loadAccessState();
    const fallbackUsers = getDefaultAccessState().users;
    const tenantCredentials = listTenantCredentials(tenant.tenant_id);
    const tenantCredential = findTenantCredential(tenant.tenant_id, normalizedUsername);
    const users = [
      ...access.users,
      ...fallbackUsers.filter((fallbackUser) => !access.users.some((item) => item.username === fallbackUser.username)),
      DEMO_ADMIN,
    ];

    const user = tenantCredential
      ? {
          id: `tenant-admin-${tenant.tenant_id}`,
          name: tenantCredential.name,
          username: tenantCredential.username,
          password: tenantCredential.password,
          role: tenantCredential.role,
          branchId: tenantCredential.branch_id,
          active: tenantCredential.active,
          permissions: ['orders.create', 'orders.edit', 'orders.cancel', 'pricing.manage', 'payments.take', 'reports.view', 'settings.manage'],
        }
      : users.find((item) =>
          item.username.toLocaleLowerCase('tr-TR') === normalizedUsername &&
          item.password === password &&
          item.active
        );

    if (tenantCredential && tenantCredential.password !== password) {
      setError('Kullanıcı adı veya şifre hatalı.');
      return;
    }

    if (!user || (tenantCredentials.length > 0 && !tenantCredential)) {
      setError('Kullanıcı adı veya şifre hatalı.');
      return;
    }

    const defaults = getDefaultSessionState();
    const activeBranch = defaults.branches.find((branch) => branch.id === user.branchId) ?? defaults.branches[1] ?? defaults.branches[0];

    activateTenantRuntime(tenant.tenant_id);

    createAuthToken({
      tenant_id: tenant.tenant_id,
      username: user.username,
      role: user.role,
      package_id: tenant.package_id,
      package_type: tenant.package_type,
      branch_id: user.branchId,
      is_main_branch: user.branchId === tenant.main_branch_id || user.role === 'Admin',
      expires_at: tenant.end_date,
    });

    saveSessionState({
      ...defaults,
      activeBranchId: user.role === 'Admin' && tenant.package_type === 'premium' ? 'all' : user.branchId,
      tenantId: tenant.tenant_id,
      packageType: tenant.package_type,
      subscriptionEndDate: tenant.end_date,
      isAuthenticated: true,
      currentUser: {
        ...defaults.currentUser,
        name: user.name,
        username: user.username,
        role: user.role,
        branch: activeBranch.label,
        branchId: user.branchId,
        tenantId: tenant.tenant_id,
        packageType: tenant.package_type,
      },
    });

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
