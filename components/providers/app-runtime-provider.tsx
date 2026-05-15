'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authSessionQueryOptions } from '@/lib/query/auth';
import { bootstrapRuntimeScope } from '@/lib/client/runtime-state';
import { connectTenantRealtime, reconnectTenantRealtime } from '@/lib/client/realtime-client';
import { authQueryKeys } from '@/lib/query/keys';
import { hydrateSessionStateFromAuth } from '@/lib/session-store';
import { setAuthSnapshotFromSession } from '@/lib/saas-store';
import { syncOfflineOrders } from '@/lib/offline-sync-store';
import { processPrintQueue, runPrinterHeartbeat, type PrintResilienceSummary } from '@/lib/print-resilience-store';
import { subscribeKdsConnectionState } from '@/lib/realtime/kds-echo';
import { resetSystemAdminIsolation, resetTenantIsolation } from '@/lib/client/isolation';
import { isLogoutInProgress, secureLogout, subscribeSecureLogoutSync } from '@/lib/client/secure-logout';

function ingestObservability(tenantId: string, payload: Record<string, unknown>) {
  void fetch('/api/system-admin/observability/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...payload }),
  }).catch(() => undefined);
}

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const { data, isFetched } = useQuery(authSessionQueryOptions());
  const [ready, setReady] = useState(false);
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [idleCountdownSec, setIdleCountdownSec] = useState(60);
  const tenantId = data?.ok ? data.session.tenantId : null;
  const role = data?.ok ? data.session.role : null;
  const previousFingerprintRef = useRef<string>('anonymous:none');
  const idleResetRef = useRef<() => void>(() => undefined);

  const authFingerprint = useMemo(() => `${tenantId ?? 'anonymous'}:${role ?? 'none'}`, [role, tenantId]);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const previousFingerprint = previousFingerprintRef.current;
      const nextFingerprint = authFingerprint;
      if (previousFingerprint !== nextFingerprint && previousFingerprint !== 'anonymous:none') {
        await Promise.allSettled([resetTenantIsolation(), resetSystemAdminIsolation()]);
      }

      hydrateSessionStateFromAuth(data?.ok ? data.session : null);
      setAuthSnapshotFromSession(data?.ok ? data.session : null);

      if (data?.ok) {
        if (data.session.role === 'super_admin') {
          await bootstrapRuntimeScope('system-admin');
          connectTenantRealtime(null);
        } else {
          await bootstrapRuntimeScope('tenant');
          reconnectTenantRealtime(data.session.tenantId);
        }
      }

      if (!cancelled) setReady(true);
      previousFingerprintRef.current = nextFingerprint;
    }

    if (!isFetched) return;
    setReady(false);
    void prepare();

    return () => {
      cancelled = true;
    };
  }, [authFingerprint, data, isFetched]);

  useEffect(() => {
    if (!isFetched || !data?.ok || data.session.role === 'super_admin') return;

    let cancelled = false;
    const tenantId = data.session.tenantId;

    const syncNow = () => {
      if (cancelled || isLogoutInProgress()) return;
      void syncOfflineOrders({ tenantId });
      void processPrintQueue({ tenantId, reason: 'runtime.sync' });
    };

    const handleOnline = () => {
      if (cancelled || isLogoutInProgress()) return;
      reconnectTenantRealtime(tenantId);
      syncNow();
      void runPrinterHeartbeat({ tenantId });
    };

    const handleOffline = () => {
      if (cancelled) return;
      connectTenantRealtime(null);
    };

    const handleFocus = () => {
      if (cancelled || typeof navigator !== 'undefined' && !navigator.onLine) return;
      syncNow();
      void runPrinterHeartbeat({ tenantId });
    };

    const handleVisibility = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncNow();
        void runPrinterHeartbeat({ tenantId });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const unsubscribeWs = subscribeKdsConnectionState((state) => {
      ingestObservability(tenantId, { websocket: { connected: state.connected, state: state.state } });
    });

    const ingestBridgeRelease = async () => {
      try {
        const response = await fetch('http://127.0.0.1:3001/health', {
          cache: 'no-store',
          mode: 'cors',
        });
        if (!response.ok) return;
        const health = await response.json().catch(() => null) as {
          updater?: { version?: string; channel?: string; build?: string; rollout?: { track?: string }; updateStatus?: string; updateError?: string; updateLatencyMs?: number };
          serviceRuntime?: { runtimeVersion?: string; releaseChannel?: string };
        } | null;
        if (!health) return;

        const updateStatus = health.updater?.updateStatus ?? 'healthy';

        ingestObservability(tenantId, {
          release: {
            version: health.updater?.version ?? health.serviceRuntime?.runtimeVersion,
            channel: health.updater?.channel ?? health.serviceRuntime?.releaseChannel,
            track: health.updater?.rollout?.track ?? health.updater?.channel ?? health.serviceRuntime?.releaseChannel,
            updateStatus,
            latencyMs: health.updater?.updateLatencyMs ?? 0,
            rollbackCount: 0,
            outdated: updateStatus !== 'healthy' && updateStatus !== 'installed',
            source: 'local-bridge',
            target: tenantId,
          },
        });
      } catch {
        // Local bridge may not be installed yet.
      }
    };

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      reconnectTenantRealtime(tenantId);
      syncNow();
      void runPrinterHeartbeat({ tenantId });
      void ingestBridgeRelease();
    } else {
      connectTenantRealtime(null);
    }

    const heartbeat = window.setInterval(async () => {
      if (cancelled || typeof navigator !== 'undefined' && !navigator.onLine) return;
      syncNow();
      const hbResult = await runPrinterHeartbeat({ tenantId }).catch(() => null) as PrintResilienceSummary | null;
      if (hbResult) {
        const onlineCount = hbResult.printers?.filter((p: { online?: boolean }) => p.online).length ?? 0;
        ingestObservability(tenantId, { printer: { onlineCount, totalCount: hbResult.printers?.length ?? 0, failedJobs: hbResult.failed } });
      }
    }, 30000);

    const releaseHeartbeat = window.setInterval(() => {
      if (cancelled || typeof navigator !== 'undefined' && !navigator.onLine) return;
      void ingestBridgeRelease();
    }, 300000);

    return () => {
      cancelled = true;
      unsubscribeWs();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(heartbeat);
      window.clearInterval(releaseHeartbeat);
    };
  }, [data, isFetched]);

  useEffect(() => {
    if (!isFetched || !data?.ok) return;

    const interval = window.setInterval(async () => {
      if (isLogoutInProgress()) return;
      const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' }).catch(() => null);
      if (!response || response.status !== 401) return;
      await secureLogout({ reason: 'token_revoked', scope: 'current', skipServer: true, redirect: true });
    }, 90000);

    return () => {
      window.clearInterval(interval);
    };
  }, [data, isFetched]);

  useEffect(() => {
    const unsubscribe = subscribeSecureLogoutSync((event) => {
      if (isLogoutInProgress()) return;
      void secureLogout({ reason: event.reason, scope: event.scope, skipServer: true, redirect: true });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isFetched || !data?.ok) return;

    const role = data.session.role;
    const idleMinutes = role === 'super_admin' ? 15 : 30;
    const warningSeconds = 60;
    const idleMs = idleMinutes * 60 * 1000;
    const warningAt = Math.max(0, idleMs - warningSeconds * 1000);

    let warningTimer: ReturnType<typeof setTimeout> | null = null;
    let logoutTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (warningTimer) clearTimeout(warningTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      warningTimer = null;
      logoutTimer = null;
      countdownTimer = null;
    };

    const triggerWarning = () => {
      if (isLogoutInProgress()) return;
      setIdleWarningOpen(true);
      setIdleCountdownSec(warningSeconds);
      countdownTimer = setInterval(() => {
        setIdleCountdownSec((prev) => {
          if (prev <= 1) {
            if (countdownTimer) {
              clearInterval(countdownTimer);
              countdownTimer = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const resetIdle = () => {
      if (isLogoutInProgress()) return;
      clearTimers();
      setIdleWarningOpen(false);
      setIdleCountdownSec(warningSeconds);
      warningTimer = setTimeout(triggerWarning, warningAt);
      logoutTimer = setTimeout(() => {
        void secureLogout({ reason: 'idle', scope: 'current', redirect: true });
      }, idleMs);
    };

    const onActivity = () => resetIdle();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetIdle();
    };

    idleResetRef.current = resetIdle;
    resetIdle();

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimers();
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [data, isFetched]);

  if (!isFetched || !ready) return null;
  return (
    <>
      {children}
      {idleWarningOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Oturum zaman aşımı uyarısı</h3>
            <p className="mt-2 text-sm text-slate-300">
              Güvenlik nedeniyle oturumunuz {idleCountdownSec} saniye içinde kapatılacak.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void secureLogout({ reason: 'idle', scope: 'current', redirect: true })}
                className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100"
              >
                Şimdi Çıkış Yap
              </button>
              <button
                type="button"
                onClick={() => idleResetRef.current()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Oturumu Sürdür
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
