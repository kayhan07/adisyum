'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, UserCircle2 } from 'lucide-react';
import { getDefaultSessionState, loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';
import { ThemeToggle } from '@/components/theme-toggle';
import { OfflinePosToolbar } from '@/components/offline-pos-toolbar';
import { PrintResilienceToolbar } from '@/components/print-resilience-toolbar';
import { canPackageAccessModule, loadAuthToken, subscribeToTenantChanges } from '@/lib/saas-store';
import { secureLogout } from '@/lib/client/secure-logout';

type AppShellProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
  focusMode?: boolean;
  immersiveMode?: boolean;
  backHref?: string;
  backLabel?: string;
};

type BackButtonProps = {
  href: string;
  label: string;
};

function BackButton({ href, label }: BackButtonProps) {
  return (
    <Link
      href={href}
      className="app-shell-back inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition hover:-translate-y-0.5"
    >
      <ArrowLeft className="h-4.5 w-4.5" />
      {label}
    </Link>
  );
}

export function AppShell({ title, subtitle, actions, children, immersiveMode = false, backHref, backLabel }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(() => getDefaultSessionState());
  const [authReady, setAuthReady] = useState(false);
  const [blockedByPackage, setBlockedByPackage] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const isModuleCenter = pathname === '/app';
  const resolvedBackHref = backHref ?? '/app';
  const resolvedBackLabel = backLabel ?? 'Modül merkezine dön';
  const showBack = !isModuleCenter;

  useEffect(() => {
    const refresh = () => {
      const nextSession = loadSessionState();
      const token = loadAuthToken();
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession.subscriptionEndDate) {
        const remaining = Math.ceil((new Date(nextSession.subscriptionEndDate).getTime() - Date.now()) / 86400000);
        setDaysLeft(remaining);
      } else {
        setDaysLeft(null);
      }

      if (!token && pathname !== '/adisyonsistemi' && pathname !== '/site' && !pathname.startsWith('/system-admin')) {
        router.replace('/adisyonsistemi');
        return;
      }

      const moduleId = pathname.split('/').filter(Boolean)[0];
      if (token && moduleId && !['app', 'site', 'adisyonsistemi', 'system-admin', 'api'].includes(moduleId)) {
        setBlockedByPackage(!canPackageAccessModule(token.package_type, moduleId, token.package_id));
      } else {
        setBlockedByPackage(false);
      }
    };
    refresh();
    const unsubscribe = subscribeToSessionChanges(refresh);
    const unsubscribeTenant = subscribeToTenantChanges(refresh);
    return () => {
      unsubscribe();
      unsubscribeTenant();
    };
  }, [pathname, router]);

  const activeBranch = session.branches.find((branch) => branch.id === session.activeBranchId) ?? session.branches[0];
  const currentUser = session.currentUser;
  const showExpiryNotice = typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 5;

  if (!authReady) return null;

  if (blockedByPackage) {
    return (
      <div className="app-shell-root">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-6 text-center shadow-soft">
            <h1 className="text-2xl font-semibold text-white">Bu paketi kullanım izniniz yok</h1>
            <p className="mt-3 text-sm leading-6 text-amber-100/80">Bu modülü açmak için abonelik paketinizin yükseltilmesi gerekir.</p>
            <Link href="/app" className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
              Modül merkezine dön
            </Link>
          </div>
        </main>
      </div>
    );
  }

  async function handleLogout(reason: 'manual' | 'shift_end') {
    if (loggingOut) return;
    setLoggingOut(true);
    await secureLogout({
      reason,
      scope: reason === 'shift_end' ? 'user' : 'current',
      redirect: true,
    });
    setLoggingOut(false);
  }

  return (
    <div className="app-shell-root">
      <main className="min-w-0">
        <div className="flex min-h-screen flex-col">
          {immersiveMode ? (
            <>
              {showBack ? (
                <div className="app-shell-header sticky top-0 z-30 px-4 py-3 backdrop-blur lg:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col gap-3">
                      <div>
                        <BackButton href={resolvedBackHref} label={resolvedBackLabel} />
                      </div>
                      <div>
                        <h1 className="app-shell-title text-xl font-semibold tracking-tight">{title}</h1>
                        <p className="app-shell-subtitle mt-1 text-sm leading-5">{subtitle}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleLogout('shift_end')}
                            disabled={loggingOut}
                            className="inline-flex h-9 items-center rounded-xl border border-amber-300/35 bg-amber-500/15 px-3 text-xs font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-60"
                          >
                            Vardiya Kapat
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleLogout('manual')}
                            disabled={loggingOut}
                            className="inline-flex h-9 items-center rounded-xl border border-rose-300/40 bg-rose-500 px-3 text-xs font-bold text-white shadow-[0_8px_20px_rgba(244,63,94,0.3)] hover:bg-rose-400 disabled:opacity-60"
                          >
                            {loggingOut ? 'Çıkılıyor…' : 'Güvenli Çıkış'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="app-chip">{activeBranch.label}</span>
                      <span className="app-chip">{currentUser.role}</span>
                      <OfflinePosToolbar />
                      <PrintResilienceToolbar />
                      <ThemeToggle />
                      {actions}
                    </div>
                  </div>
                  {showExpiryNotice ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
                      Aboneliğinizin bitmesine {daysLeft} gün kaldı. Her açılışta bu uyarı gösterilir, lütfen yenileme planlayın.
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex-1 overflow-auto p-4 lg:p-5">{children}</div>
            </>
          ) : (
            <>
              <header className="app-shell-header px-5 py-4 backdrop-blur lg:px-7 lg:py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-col gap-3">
                    {showBack ? (
                      <div>
                        <BackButton href={resolvedBackHref} label={resolvedBackLabel} />
                      </div>
                    ) : null}
                    <div>
                      <h1 className="app-shell-title text-2xl font-semibold tracking-tight">{title}</h1>
                      <p className="app-shell-subtitle mt-1.5 text-sm leading-6">{subtitle}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleLogout('shift_end')}
                          disabled={loggingOut}
                          className="inline-flex h-9 items-center rounded-xl border border-amber-300/35 bg-amber-500/15 px-3 text-xs font-bold text-amber-100 hover:bg-amber-500/25 disabled:opacity-60"
                        >
                          Vardiya Kapat
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLogout('manual')}
                          disabled={loggingOut}
                          className="inline-flex h-9 items-center rounded-xl border border-rose-300/40 bg-rose-500 px-3 text-xs font-bold text-white shadow-[0_8px_20px_rgba(244,63,94,0.3)] hover:bg-rose-400 disabled:opacity-60"
                        >
                          {loggingOut ? 'Çıkılıyor…' : 'Güvenli Çıkış'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="app-chip">{activeBranch.label}</span>
                    <span className="app-chip">{currentUser.role}</span>
                    <div className="app-shell-userpill inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm">
                      <UserCircle2 className="app-shell-userpill-icon h-4.5 w-4.5" />
                      <span className="app-shell-userpill-name font-semibold">{currentUser.name}</span>
                    </div>
                    <OfflinePosToolbar />
                    <PrintResilienceToolbar />
                    <ThemeToggle />
                    {actions}
                  </div>
                </div>
                {showExpiryNotice ? (
                  <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
                    Aboneliğinizin bitmesine {daysLeft} gün kaldı. Her açılışta bu uyarı gösterilir, lütfen yenileme planlayın.
                  </div>
                ) : null}
              </header>
              <div className="flex-1 overflow-auto p-5 lg:p-7">{children}</div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
