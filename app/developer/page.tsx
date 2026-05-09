'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { getDefaultIntegrationState, loadIntegrationState, saveIntegrationState, subscribeToIntegrationChanges } from '@/lib/integration-store';

function buildApiPrefix() {
  return `ark_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export default function DeveloperPage() {
  const [state, setState] = useState(() => getDefaultIntegrationState());
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => setState(loadIntegrationState());
    refresh();
    const unsubscribe = subscribeToIntegrationChanges(refresh);
    return () => unsubscribe();
  }, []);

  function persist(nextState: ReturnType<typeof loadIntegrationState>) {
    saveIntegrationState(nextState);
    setState(nextState);
  }

  function rotateKey(id: string) {
    persist({
      ...state,
      apiKeys: state.apiKeys.map((key) => key.id === id ? { ...key, prefix: buildApiPrefix(), status: 'Aktif' } : key),
      apiUsageLogs: [
        { id: `log-${Date.now()}`, method: 'POST', path: '/api/v2/keys/rotate', status: 201, actor: 'Merkez Admin', time: '88 ms' },
        ...state.apiUsageLogs,
      ],
    });
    setMessage('API anahtarı yenilendi ve log kaydı işlendi.');
  }

  function queueWebhookTest() {
    persist({
      ...state,
      webhookEvents: [
        { id: `wh-${Date.now()}`, event: 'developer.test', target: 'https://hooks.partner.local/test', status: 'Kuyruklandı' },
        ...state.webhookEvents,
      ],
      apiUsageLogs: [
        { id: `log-${Date.now()}`, method: 'POST', path: '/api/v1/developer/webhooks/test', status: 201, actor: 'Merkez Admin', time: '102 ms' },
        ...state.apiUsageLogs,
      ],
    });
    setMessage('Test webhook olayı kuyruklandı.');
  }

  function activateIntegration(id: string) {
    persist({
      ...state,
      partnerIntegrations: state.partnerIntegrations.map((integration) =>
        integration.id === id ? { ...integration, status: 'Aktif senkron' } : integration,
      ),
    });
    setMessage('Entegrasyon durumu aktif senkrona alındı.');
  }

  return (
    <AppShell
      title="Geliştirici paneli ve dış sistemler"
      subtitle="API anahtarlarını yönetin, kullanım günlüklerini izleyin, webhook olaylarını kontrol edin ve dış platform adaptörlerini tek panelden yönetin."
      actions={<button type="button" onClick={() => document.getElementById('api-anahtarlari')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">API Anahtarlarına Git</button>}
    >
      {message ? <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</section> : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div id="api-anahtarlari" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">API anahtarları</p>
          <div className="mt-4 space-y-3">
            {state.apiKeys.map((key) => (
              <div key={key.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{key.name}</p>
                  <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{key.status}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{key.prefix}</p>
                <p className="mt-1 text-sm text-muted">Limit: {key.limit}</p>
                <p className="mt-1 text-sm text-ink">{key.scopes}</p>
                <button type="button" onClick={() => rotateKey(key.id)} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">Anahtarı yenile</button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Webhook olayları</p>
            <button type="button" onClick={queueWebhookTest} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">Test olayı gönder</button>
          </div>
          <div className="mt-4 space-y-3">
            {state.webhookEvents.map((event) => (
              <div key={event.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                <p className="font-semibold text-ink">{event.event}</p>
                <p className="mt-1 text-sm text-muted">{event.target}</p>
                <p className="mt-2 inline-flex rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{event.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">API kullanım günlükleri</p>
          <div className="mt-4 space-y-3">
            {state.apiUsageLogs.map((log) => (
              <div key={log.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{log.method} {log.path}</p>
                  <span className="rounded-full border border-line px-3 py-1 text-sm text-muted">{log.status}</span>
                </div>
                <p className="mt-2 text-sm text-muted">Aktör: {log.actor}</p>
                <p className="mt-1 text-sm text-muted">Süre: {log.time}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Hazır üçüncü parti adaptörler</p>
          <div className="mt-4 space-y-3">
            {state.partnerIntegrations.map((integration) => (
              <div key={integration.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{integration.name}</p>
                  <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{integration.version}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{integration.type}</p>
                <p className="mt-1 text-sm text-ink">{integration.status}</p>
                <button type="button" onClick={() => activateIntegration(integration.id)} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">Aktif et</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
