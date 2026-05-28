'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, FlaskConical, HardDrive, History, Layers3, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

type TabId = 'versions' | 'rollouts' | 'automation' | 'policies' | 'failed' | 'rollbacks' | 'certification' | 'diagnostics' | 'chaos';

type ReleasePayload = {
  ok: boolean;
  generatedAt: string;
  registry: Array<{ component: string; version: string; channel: string; supportedHardwareStatuses: string[]; health: { updateSuccessRate: number; rollbackRate: number; reconnectFailureRate: number; postUpdateIncidentRate: number }; notes: string[] }>;
  compatibilityRules: Array<{ id: string; sourceComponent: string; targetComponent: string; minTargetVersion?: string; severity: string; reason: string }>;
  rollouts: Array<{ id: string; name: string; component: string; version: string; channel: string; status: string; targetPercent: number; targetTenantIds: string[]; rollbackVersion?: string; safetyGates: string[]; metrics: { targetedDevices: number; updatedDevices: number; failedUpdates: number; rollbackEvents: number; incompatibleDevices: number } }>;
  health: { totalDevices: number; updatedDevices: number; failedUpdates: number; rollbackEvents: number; incompatibleDevices: number; updateSuccessRate: number; activeRollouts: number; pausedRollouts: number; certifiedHardwareCount: number };
  certification: { summary: Record<string, number>; matrix: Array<{ category: string; vendor: string; model: string; driverType: string; connectionType: string; status: string; knownIssues: string[]; lastValidatedAt: string }> };
  automation: {
    policies: Array<{ id: string; name: string; description: string; severity: string; cooldownMinutes: number; approvalRequired: boolean; condition: string; actions: string[] }>;
    decisions: Array<{ id: string; policyName: string; severity: string; triggered: boolean; reason: string; actions: Array<{ type: string; status: string; message: string }>; correlationId: string; createdAt: string }>;
    summary: { policies: number; evaluatedDecisions: number; triggeredDecisions: number; automaticActions: number; approvalRequired: number; criticalSignals: number };
    riskSignals: Array<{ scope: string; score: number; severity: string; evidence: string[]; recommendation: string }>;
  };
};

const tabs: Array<{ id: TabId; label: string; icon: typeof Layers3 }> = [
  { id: 'versions', label: 'Sürümler', icon: Layers3 },
  { id: 'rollouts', label: 'Rollout', icon: RefreshCw },
  { id: 'automation', label: 'Otomasyon', icon: Bot },
  { id: 'policies', label: 'Politikalar', icon: ShieldCheck },
  { id: 'failed', label: 'Başarısız Güncellemeler', icon: AlertTriangle },
  { id: 'rollbacks', label: 'Rollback', icon: RotateCcw },
  { id: 'certification', label: 'Sertifikasyon', icon: HardDrive },
  { id: 'diagnostics', label: 'Diagnostik', icon: FlaskConical },
  { id: 'chaos', label: 'Chaos Test', icon: History },
];

export function ReleaseOperationsCenter() {
  const [activeTab, setActiveTab] = useState<TabId>('versions');
  const [data, setData] = useState<ReleasePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [rollback, setRollback] = useState<any>(null);
  const [chaos, setChaos] = useState<any>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const startedAt = Date.now();
    const response = await fetch('/api/system-admin/release-operations', { credentials: 'include', cache: 'no-store' }).catch((error) => {
      console.error('[business-flow] release operations load failed', {
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!response?.ok) {
      console.warn('[business-flow] release operations returned non-ok', {
        status: response?.status ?? null,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      setError('Release operasyon verisi alınamadı.');
      setLoading(false);
      return;
    }
    setData(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const failedUpdates = useMemo(() => data?.rollouts.filter((rollout) => rollout.metrics.failedUpdates > 0 || rollout.metrics.incompatibleDevices > 0) ?? [], [data]);

  async function postAction(body: Record<string, unknown>) {
    const response = await fetch('/api/system-admin/release-operations', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async function requestSnapshot() {
    const payload = await postAction({ action: 'diagnostic_snapshot', tenantId: 'ABN-48291', bridgeId: 'pilot-bridge-01' });
    setSnapshot(payload.snapshot);
  }

  async function requestRollbackPlan() {
    const payload = await postAction({ action: 'rollback_plan', tenantId: 'ABN-48291', component: 'bridge' });
    setRollback(payload.rollback);
  }

  async function runChaos(scenario: string) {
    const payload = await postAction({ action: 'simulate_chaos', scenario });
    setChaos(payload.chaos);
  }

  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-6 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <Link href="/system-admin" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Kontrol Merkezi
          </Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Autonomous Release Operations</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Sürüm, rollout ve otonom operasyon yönetimi</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Cloud, desktop, bridge, yerel ajan ve fiscal adapter sürümlerini policy engine, otomatik koruma,
                rollback kapıları, saha diagnostikleri ve chaos testleriyle yönetin.
              </p>
            </div>
            <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10">
              <RefreshCw className="h-4 w-4" /> Yenile
            </button>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">Release operasyon verisi yükleniyor...</div> : null}

        {data ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Metric title="Aktif rollout" value={data.health.activeRollouts} detail={`${data.health.pausedRollouts} duraklatılmış`} />
              <Metric title="Güncellenen cihaz" value={`${data.health.updatedDevices}/${data.health.totalDevices}`} detail={`Başarı ${data.health.updateSuccessRate}%`} />
              <Metric title="Tetiklenen policy" value={data.automation.summary.triggeredDecisions} detail={`${data.automation.summary.automaticActions} otomatik aksiyon`} tone={data.automation.summary.criticalSignals ? 'warn' : 'ok'} />
              <Metric title="Onay bekleyen" value={data.automation.summary.approvalRequired} detail="İnsan onayı gereken aksiyon" />
              <Metric title="Sertifikalı donanım" value={data.health.certifiedHardwareCount} detail="Onaylı cihaz matrisi" tone="ok" />
            </section>

            <nav className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                    <Icon className="h-4 w-4" /> {tab.label}
                  </button>
                );
              })}
            </nav>

            {activeTab === 'versions' ? <VersionsPanel data={data} /> : null}
            {activeTab === 'rollouts' ? <RolloutsPanel data={data} /> : null}
            {activeTab === 'automation' ? <AutomationPanel data={data} /> : null}
            {activeTab === 'policies' ? <PoliciesPanel data={data} /> : null}
            {activeTab === 'failed' ? <FailedUpdatesPanel rollouts={failedUpdates} /> : null}
            {activeTab === 'rollbacks' ? <RollbackPanel rollback={rollback} onCreate={() => void requestRollbackPlan()} /> : null}
            {activeTab === 'certification' ? <CertificationPanel data={data} /> : null}
            {activeTab === 'diagnostics' ? <DiagnosticsPanel snapshot={snapshot} onSnapshot={() => void requestSnapshot()} /> : null}
            {activeTab === 'chaos' ? <ChaosPanel chaos={chaos} onRun={runChaos} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ title, value, detail, tone = 'default' }: { title: string; value: string | number; detail: string; tone?: 'default' | 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-200' : tone === 'warn' ? 'text-amber-200' : 'text-white';
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className={`mt-3 text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </article>
  );
}

function VersionsPanel({ data }: { data: ReleasePayload }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title="Merkezi sürüm kayıtları" subtitle="Cloud, desktop, bridge, ajan ve fiscal adapter sürümleri için tek kaynak." />
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr><th className="pb-3">Bileşen</th><th className="pb-3">Sürüm</th><th className="pb-3">Kanal</th><th className="pb-3">Update başarı</th><th className="pb-3">Rollback</th><th className="pb-3">Incident</th><th className="pb-3">Donanım</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.registry.map((entry) => (
              <tr key={`${entry.component}-${entry.version}`}>
                <td className="py-4 font-semibold text-white">{entry.component}</td>
                <td className="py-4 text-slate-300">{entry.version}</td>
                <td className="py-4"><Badge>{entry.channel}</Badge></td>
                <td className="py-4 text-emerald-200">{entry.health.updateSuccessRate}%</td>
                <td className="py-4 text-slate-300">{entry.health.rollbackRate}%</td>
                <td className="py-4 text-slate-300">{entry.health.postUpdateIncidentRate}%</td>
                <td className="py-4 text-slate-400">{entry.supportedHardwareStatuses.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RolloutsPanel({ data }: { data: ReleasePayload }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.rollouts.map((rollout) => (
        <article key={rollout.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{rollout.channel}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{rollout.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{rollout.component} {rollout.version} · hedef %{rollout.targetPercent}</p>
            </div>
            <Badge>{rollout.status}</Badge>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <MiniStat label="Hedef cihaz" value={rollout.metrics.targetedDevices} />
            <MiniStat label="Güncellenen" value={rollout.metrics.updatedDevices} />
            <MiniStat label="Başarısız" value={rollout.metrics.failedUpdates} />
            <MiniStat label="Uyumsuz" value={rollout.metrics.incompatibleDevices} />
          </div>
        </article>
      ))}
    </section>
  );
}

function AutomationPanel({ data }: { data: ReleasePayload }) {
  const triggered = data.automation.decisions.filter((decision) => decision.triggered);
  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
        <PanelTitle title="Otomatik aksiyonlar" subtitle="Policy engine tarafından tetiklenen rollout, cihaz ve queue koruma kararları." />
        <div className="mt-5 grid gap-3">
          {triggered.map((decision) => (
            <div key={decision.id} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-white">{decision.policyName}</p>
                <Badge>{decision.severity}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-300">{decision.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {decision.actions.map((action) => <Badge key={`${decision.id}-${action.type}`}>{action.status}: {action.type}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </article>
      <InfoCard title="AI operasyon sinyalleri" rows={data.automation.riskSignals.map((signal) => `${signal.score}/100 · ${signal.recommendation}`)} />
    </section>
  );
}

function PoliciesPanel({ data }: { data: ReleasePayload }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.automation.policies.map((policy) => (
        <article key={policy.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{policy.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{policy.description}</p>
            </div>
            <Badge>{policy.severity}</Badge>
          </div>
          <p className="mt-4 rounded-2xl bg-slate-950/50 p-3 text-sm text-slate-300">{policy.condition}</p>
          <p className="mt-3 text-xs text-slate-500">Cooldown {policy.cooldownMinutes} dk · {policy.approvalRequired ? 'operator onayı gerekir' : 'otomatik çalışabilir'}</p>
        </article>
      ))}
    </section>
  );
}

function FailedUpdatesPanel({ rollouts }: { rollouts: ReleasePayload['rollouts'] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title="Başarısız güncelleme izleme" subtitle="Rollout sırasında durdurma, inceleme ve rollback gerektiren sinyaller." />
      <div className="mt-5 grid gap-3">
        {rollouts.length === 0 ? <p className="text-sm text-slate-400">Başarısız update yok.</p> : rollouts.map((rollout) => (
          <div key={rollout.id} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-100">{rollout.name}</p>
            <p className="mt-1 text-sm text-amber-100/80">{rollout.metrics.failedUpdates} başarısız update, {rollout.metrics.incompatibleDevices} uyumsuz cihaz.</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RollbackPanel({ rollback, onCreate }: { rollback: any; onCreate: () => void }) {
  return <JsonActionPanel title="Saha rollback planlayıcı" subtitle="Tenant, şube veya cihaz grubu bazlı güvenli geri dönüş planı üretir." button="Plan oluştur" payload={rollback} onClick={onCreate} />;
}

function CertificationPanel({ data }: { data: ReleasePayload }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title="Saha laboratuvarı ve sertifikasyon" subtitle="Desteklenen cihaz matrisi, bilinen sorunlar ve son doğrulama tarihleri." />
      <div className="mt-5 grid gap-3">
        {data.certification.matrix.map((device) => (
          <div key={`${device.vendor}-${device.model}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-white">{device.vendor} {device.model}</p>
              <Badge>{device.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-400">{device.category} · {device.driverType} · {device.connectionType}</p>
            {device.knownIssues.length ? <p className="mt-2 text-sm text-amber-100">{device.knownIssues.join(' ')}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticsPanel({ snapshot, onSnapshot }: { snapshot: any; onSnapshot: () => void }) {
  return <JsonActionPanel title="Uzaktan diagnostik snapshot" subtitle="Bridge, spool, yazıcı, queue, sync ve fiscal adapter durumunu tek pakette toplar." button="Snapshot iste" payload={snapshot} onClick={onSnapshot} />;
}

function ChaosPanel({ chaos, onRun }: { chaos: any; onRun: (scenario: string) => void }) {
  const scenarios = ['reconnect_storm', 'rollout_corruption', 'printer_fleet_failure', 'offline_replay_corruption', 'bridge_crash_loop'];
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title="Production chaos testing" subtitle="Policy engine davranışını reconnect storm, rollout corruption, printer fleet failure ve offline replay bozulması altında simüle eder." />
      <div className="mt-5 flex flex-wrap gap-2">
        {scenarios.map((scenario) => <button key={scenario} type="button" onClick={() => onRun(scenario)} className="rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100">{scenario}</button>)}
      </div>
      {chaos ? <pre className="mt-5 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(chaos, null, 2)}</pre> : null}
    </section>
  );
}

function JsonActionPanel({ title, subtitle, button, payload, onClick }: { title: string; subtitle: string; button: string; payload: any; onClick: () => void }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PanelTitle title={title} subtitle={subtitle} />
        <button type="button" onClick={onClick} className="rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100">{button}</button>
      </div>
      {payload ? <pre className="mt-5 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(payload, null, 2)}</pre> : null}
    </section>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
}

function InfoCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="text-sm text-slate-400">Veri yok.</p> : rows.map((row) => (
          <div key={row} className="flex gap-2 text-sm text-slate-300">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" /> {row}
          </div>
        ))}
      </div>
    </article>
  );
}
