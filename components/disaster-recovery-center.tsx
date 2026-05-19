'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, DatabaseZap, Globe2, Network, RadioTower, RotateCcw, ShieldAlert, Workflow } from 'lucide-react';

type TabId = 'regions' | 'queues' | 'realtime' | 'failover' | 'timeline' | 'blast' | 'policies' | 'chaos';

type RecoveryPayload = {
  ok: boolean;
  summary: { domains: number; degradedDomains: number; regions: number; degradedRegions: number; approvalRequired: number; queueBacklog: number; activeMode: string };
  domains: Array<{ id: string; type: string; name: string; region: string; blastRadius: string[]; isolationPolicy: string; recoveryMode: string; healthScore: number }>;
  regions: Array<{ region: string; status: string; primary: boolean; redis: string; websocket: string; database: string; workers: string; queueBacklog: number; reconnectStormScore: number; lastCheckedAt: string }>;
  decisions: Array<{ id: string; domainId: string; severity: string; mode: string; reason: string; actions: Array<{ type: string; approvalRequired: boolean; message: string }>; blastRadius: string[]; createdAt: string }>;
  snapshot: any;
};

const tabs: Array<{ id: TabId; label: string; icon: typeof Globe2 }> = [
  { id: 'regions', label: 'Region Health', icon: Globe2 },
  { id: 'queues', label: 'Queue Recovery', icon: Workflow },
  { id: 'realtime', label: 'Realtime Recovery', icon: RadioTower },
  { id: 'failover', label: 'Failover Actions', icon: RotateCcw },
  { id: 'timeline', label: 'Recovery Timeline', icon: DatabaseZap },
  { id: 'blast', label: 'Blast Radius', icon: Network },
  { id: 'policies', label: 'Emergency Policies', icon: ShieldAlert },
  { id: 'chaos', label: 'Chaos Recovery', icon: AlertTriangle },
];

export function DisasterRecoveryCenter() {
  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('regions');
  const [simulation, setSimulation] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const response = await fetch('/api/system-admin/disaster-recovery', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    if (!response?.ok) {
      setError('Disaster recovery verisi alınamadı.');
      setLoading(false);
      return;
    }
    setData(await response.json());
    setLoading(false);
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/system-admin/disaster-recovery', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async function createSnapshot() {
    const payload = await post({ action: 'snapshot' });
    setSnapshot(payload.snapshot);
  }

  async function simulate(scenario: string) {
    const payload = await post({ action: 'simulate_recovery', scenario });
    setSimulation(payload.recovery);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-6 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <Link href="/system-admin" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Kontrol Merkezi
          </Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-200">Disaster Recovery Center</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Çok bölgeli dayanıklılık ve kurtarma merkezi</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Failure domain, region health, queue recovery, realtime degraded mode, failover approval ve blast radius kararlarını tek operasyon yüzeyinde izleyin.
              </p>
            </div>
            <button type="button" onClick={() => void load()} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100">Yenile</button>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">Recovery verisi yükleniyor...</div> : null}

        {data ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Metric title="Aktif mod" value={data.summary.activeMode} detail="Platform recovery state" tone="warn" />
              <Metric title="Degraded domain" value={`${data.summary.degradedDomains}/${data.summary.domains}`} detail="Blast radius izleniyor" />
              <Metric title="Region" value={data.summary.regions} detail={`${data.summary.degradedRegions} degraded`} />
              <Metric title="Queue backlog" value={data.summary.queueBacklog} detail="Recovery snapshot kapsamı" />
              <Metric title="Onay bekleyen" value={data.summary.approvalRequired} detail="Critical failover gate" tone={data.summary.approvalRequired ? 'warn' : 'ok'} />
            </section>

            <nav className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-red-400/15 text-red-100' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                    <Icon className="h-4 w-4" /> {tab.label}
                  </button>
                );
              })}
            </nav>

            {activeTab === 'regions' ? <RegionPanel data={data} /> : null}
            {activeTab === 'queues' ? <DecisionPanel title="Queue Recovery" decisions={data.decisions.filter((decision) => decision.actions.some((action) => action.type.includes('replay') || action.type.includes('workers')))} /> : null}
            {activeTab === 'realtime' ? <DecisionPanel title="Realtime Recovery" decisions={data.decisions.filter((decision) => decision.actions.some((action) => action.type === 'rebuild_stream'))} /> : null}
            {activeTab === 'failover' ? <DecisionPanel title="Failover Actions" decisions={data.decisions.filter((decision) => decision.actions.some((action) => action.approvalRequired || action.type === 'failover_region'))} /> : null}
            {activeTab === 'timeline' ? <SnapshotPanel snapshot={snapshot ?? data.snapshot} onSnapshot={() => void createSnapshot()} /> : null}
            {activeTab === 'blast' ? <BlastRadiusPanel data={data} /> : null}
            {activeTab === 'policies' ? <EmergencyPoliciesPanel data={data} /> : null}
            {activeTab === 'chaos' ? <ChaosPanel simulation={simulation} onSimulate={simulate} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function RegionPanel({ data }: { data: RecoveryPayload }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.regions.map((region) => (
        <article key={region.region} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">{region.primary ? 'primary' : 'standby'}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{region.region}</h2>
              <p className="mt-1 text-sm text-slate-400">Son kontrol: {region.lastCheckedAt}</p>
            </div>
            <Badge>{region.status}</Badge>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat label="Redis" value={region.redis} />
            <MiniStat label="Websocket" value={region.websocket} />
            <MiniStat label="Database" value={region.database} />
            <MiniStat label="Workers" value={region.workers} />
          </div>
        </article>
      ))}
    </section>
  );
}

function DecisionPanel({ title, decisions }: { title: string; decisions: RecoveryPayload['decisions'] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title={title} subtitle="Recovery kararları, approval gate ve uygulanacak güvenli aksiyonlar." />
      <div className="mt-5 grid gap-3">
        {decisions.length === 0 ? <p className="text-sm text-slate-400">Bu kapsamda aktif recovery kararı yok.</p> : decisions.map((decision) => (
          <div key={decision.id} className="rounded-2xl border border-red-300/15 bg-red-400/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-white">{decision.domainId}</p>
              <Badge>{decision.severity}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-300">{decision.reason}</p>
            <div className="mt-3 grid gap-2">
              {decision.actions.map((action) => <p key={`${decision.id}-${action.type}`} className="text-sm text-slate-400">{action.approvalRequired ? 'Onay gerekir' : 'Otomatik'} · {action.message}</p>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SnapshotPanel({ snapshot, onSnapshot }: { snapshot: any; onSnapshot: () => void }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PanelTitle title="Operational Recovery Snapshot" subtitle="Rollout, queue, incident, policy ve device state tek kurtarma paketinde." />
        <button type="button" onClick={onSnapshot} className="rounded-2xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100">Snapshot üret</button>
      </div>
      <pre className="mt-5 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(snapshot, null, 2)}</pre>
    </section>
  );
}

function BlastRadiusPanel({ data }: { data: RecoveryPayload }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.domains.map((domain) => (
        <article key={domain.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{domain.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{domain.type} · {domain.region}</p>
            </div>
            <Badge>{domain.recoveryMode}</Badge>
          </div>
          <p className="mt-4 text-sm text-slate-300">{domain.isolationPolicy}</p>
          <div className="mt-4 flex flex-wrap gap-2">{domain.blastRadius.map((item) => <Badge key={`${domain.id}-${item}`}>{item}</Badge>)}</div>
        </article>
      ))}
    </section>
  );
}

function EmergencyPoliciesPanel({ data }: { data: RecoveryPayload }) {
  return <DecisionPanel title="Emergency Policies" decisions={data.decisions} />;
}

function ChaosPanel({ simulation, onSimulate }: { simulation: any; onSimulate: (scenario: string) => void }) {
  const scenarios = ['redis_outage', 'websocket_collapse', 'worker_crash_storm', 'db_reconnect_storm', 'rollout_corruption', 'replay_corruption', 'region_isolation'];
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <PanelTitle title="Chaos Recovery Testing" subtitle="Büyük arızalarda recovery kararlarının güvenli aksiyon ürettiğini simüle eder." />
      <div className="mt-5 flex flex-wrap gap-2">
        {scenarios.map((scenario) => <button key={scenario} type="button" onClick={() => onSimulate(scenario)} className="rounded-2xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100">{scenario}</button>)}
      </div>
      {simulation ? <pre className="mt-5 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(simulation, null, 2)}</pre> : null}
    </section>
  );
}

function Metric({ title, value, detail, tone = 'default' }: { title: string; value: string | number; detail: string; tone?: 'default' | 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-200' : tone === 'warn' ? 'text-amber-200' : 'text-white';
  return <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p><p className={`mt-3 text-2xl font-semibold ${color}`}>{value}</p><p className="mt-1 text-sm text-slate-400">{detail}</p></article>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>;
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">{children}</span>;
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>;
}
