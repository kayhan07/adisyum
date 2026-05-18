'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Activity, BrainCircuit, Building2, CreditCard, FileText, Printer, ShieldCheck, Users, Workflow } from 'lucide-react';

type TenantRow = {
  tenantId: string;
  companyName: string;
  status: string;
  plan: string;
  billingPeriod: string;
  branchCount: number;
  activeBranchCount: number;
  activeUsers: number;
  dailyOrders: number;
  dailyRevenue: number;
  expiresAt?: string | null;
};
type PresenceRow = { id: string; tenantId: string; username: string; role: string; status: string; currentRoute?: string | null; activeTableId?: string | null; lastSeenAt: string };
type DeviceRow = { id: string; tenantId: string; deviceId: string; deviceType: string; status: string; latencyMs?: number | null; failureCount: number; lastHeartbeatAt: string };
type EventRow = { id: string; tenantId?: string | null; type: string; severity: string; message: string; createdAt: string };
type LivePayload = { presence: PresenceRow[]; devices: DeviceRow[]; events: EventRow[] };
type IncidentRow = { id: string; tenantId?: string | null; title: string; severity: string; status: string; summary: string; openedAt: string; events?: Array<{ id: string; eventType: string; message: string; createdAt: string }> };
type AuditRow = { id: string; action: string; entity?: string | null; entityId?: string | null; userId?: string | null; deviceId?: string | null; correlationId?: string | null; createdAt: string };
type WorkspaceSection = 'overview' | 'finance' | 'operations' | 'users' | 'devices' | 'printers' | 'queues' | 'incidents' | 'audit' | 'billing' | 'templates' | 'ai' | 'security' | 'branches' | 'settings';

const sections: Array<{ id: WorkspaceSection; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Genel Bakış', icon: Building2 },
  { id: 'finance', label: 'Finans', icon: CreditCard },
  { id: 'operations', label: 'Operasyon', icon: Activity },
  { id: 'users', label: 'Kullanıcılar', icon: Users },
  { id: 'devices', label: 'Cihazlar', icon: Printer },
  { id: 'printers', label: 'Yazıcılar', icon: Printer },
  { id: 'queues', label: 'Kuyruklar', icon: Workflow },
  { id: 'incidents', label: 'Olaylar', icon: Activity },
  { id: 'audit', label: 'Denetim', icon: FileText },
  { id: 'billing', label: 'Faturalama', icon: CreditCard },
  { id: 'templates', label: 'Şablonlar', icon: FileText },
  { id: 'ai', label: 'AI Analiz', icon: BrainCircuit },
  { id: 'security', label: 'Güvenlik', icon: ShieldCheck },
  { id: 'branches', label: 'Şubeler', icon: Building2 },
  { id: 'settings', label: 'Ayarlar', icon: ShieldCheck },
];

export default function TenantWorkspaceClient({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadBase() {
      const tenantsResponse = await fetch('/api/system-admin/tenants', { credentials: 'include', cache: 'no-store' });
      const tenantsPayload = await tenantsResponse.json().catch(() => null) as { tenants?: TenantRow[] } | null;
      if (!cancelled) setTenant(tenantsPayload?.tenants?.find((item) => item.tenantId === tenantId) ?? null);
      if (!cancelled) setLoading(false);
    }
    void loadBase();
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadLive() {
      const [liveResponse, incidentResponse] = await Promise.all([
        fetch('/api/system-admin/live-operations', { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/system-admin/incidents?tenantId=${encodeURIComponent(tenantId)}`, { credentials: 'include', cache: 'no-store' }),
      ]);
      const livePayload = await liveResponse.json().catch(() => null) as LivePayload | null;
      const incidentPayload = await incidentResponse.json().catch(() => null) as { incidents?: IncidentRow[] } | null;
      if (!cancelled) {
        setLive(livePayload);
        setIncidents(incidentPayload?.incidents ?? []);
      }
    }
    void loadLive();
    const interval = window.setInterval(() => { void loadLive(); }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tenantId]);

  useEffect(() => {
    if (activeSection !== 'audit' && activeSection !== 'overview' && activeSection !== 'incidents') return;
    let cancelled = false;
    async function loadAudit() {
      const response = await fetch(`/api/system-admin/audit?tenantId=${encodeURIComponent(tenantId)}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { rows?: AuditRow[] } | null;
      if (!cancelled) setAudit(payload?.rows ?? []);
    }
    void loadAudit();
    return () => { cancelled = true; };
  }, [activeSection, tenantId]);

  const presence = useMemo(() => live?.presence.filter((row) => row.tenantId === tenantId) ?? [], [live, tenantId]);
  const devices = useMemo(() => live?.devices.filter((row) => row.tenantId === tenantId) ?? [], [live, tenantId]);
  const events = useMemo(() => live?.events.filter((row) => row.tenantId === tenantId) ?? [], [live, tenantId]);

  if (loading) return <main className="min-h-screen bg-[#08111f] p-6 text-white">Çalışma alanı yükleniyor...</main>;
  if (!tenant) return <main className="min-h-screen bg-[#08111f] p-6 text-white">Abonelik bulunamadı.</main>;

  return <main className="min-h-screen bg-[#08111f] text-white">
    <header className="border-b border-white/10 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/system-admin" className="text-sm text-slate-400">← Abonelikler</Link>
          <h1 className="mt-2 text-3xl font-semibold">{tenant.companyName}</h1>
          <p className="mt-1 text-sm text-slate-400">{tenant.tenantId} / {tenant.plan} / {tenant.status}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <WorkspaceMetric label="Online Kullanıcı" value={String(presence.length)} />
          <WorkspaceMetric label="Açık Olay" value={String(incidents.filter((incident) => incident.status !== 'resolved').length)} />
          <WorkspaceMetric label="Ciro" value={`₺${tenant.dailyRevenue.toLocaleString('tr-TR')}`} />
        </div>
      </div>
    </header>
    <div className="grid min-h-[calc(100vh-113px)] lg:grid-cols-[240px_minmax(480px,1fr)_320px]">
      <aside className="border-r border-white/10 p-4">
        <nav className="grid gap-1">
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveSection(id)} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${activeSection === id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}><Icon className="h-4 w-4" />{label}</button>)}
        </nav>
      </aside>
      <section className="min-w-0 p-6">
        <WorkspaceSurface section={activeSection} tenant={tenant} presence={presence} devices={devices} events={events} incidents={incidents} audit={audit} />
      </section>
      <aside className="border-l border-white/10 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Canlı Akış</h2>
        <SidebarBlock title="Online kullanıcılar" rows={presence.slice(0, 6).map((row) => `${row.username} / ${row.currentRoute ?? '-'}`)} />
        <SidebarBlock title="Aktif olaylar" rows={incidents.filter((incident) => incident.status !== 'resolved').slice(0, 5).map((incident) => incident.title)} />
        <SidebarBlock title="Son değişiklikler" rows={audit.slice(0, 5).map((row) => row.action)} />
        <SidebarBlock title="Operasyon uyarıları" rows={events.filter((event) => event.severity !== 'info').slice(0, 5).map((event) => event.message)} />
      </aside>
    </div>
  </main>;
}

function WorkspaceSurface({ section, tenant, presence, devices, events, incidents, audit }: { section: WorkspaceSection; tenant: TenantRow; presence: PresenceRow[]; devices: DeviceRow[]; events: EventRow[]; incidents: IncidentRow[]; audit: AuditRow[] }) {
  if (section === 'overview') return <div className="grid gap-5">
    <div className="grid gap-4 md:grid-cols-4">
      <WorkspaceCard title="Bugünkü ciro" value={`₺${tenant.dailyRevenue.toLocaleString('tr-TR')}`} />
      <WorkspaceCard title="Aktif kullanıcı" value={String(presence.length)} />
      <WorkspaceCard title="Aktif şube" value={`${tenant.activeBranchCount}/${tenant.branchCount}`} />
      <WorkspaceCard title="Açık olay" value={String(incidents.filter((incident) => incident.status !== 'resolved').length)} />
    </div>
    <ListPanel title="Son abonelik değişiklikleri" rows={audit.slice(0, 8).map((row) => `${row.action} / ${row.entity ?? '-'}`)} />
  </div>;
  if (section === 'operations') return <ListPanel title="Operasyon" rows={events.map((event) => `${event.type} / ${event.message}`)} />;
  if (section === 'users') return <ListPanel title="Kullanıcılar" rows={presence.map((row) => `${row.username} / ${row.role} / ${row.status}`)} />;
  if (section === 'devices' || section === 'printers') return <ListPanel title={section === 'printers' ? 'Yazıcılar' : 'Cihazlar'} rows={devices.map((device) => `${device.deviceType} / ${device.deviceId} / ${device.status} / ${device.latencyMs ?? '-'}ms`)} />;
  if (section === 'incidents') return <ListPanel title="Olaylar" rows={incidents.map((incident) => `${incident.severity} / ${incident.status} / ${incident.title}`)} />;
  if (section === 'audit') return <ListPanel title="Denetim" rows={audit.map((row) => `${row.action} / ${row.userId ?? '-'} / ${row.entity ?? '-'}`)} />;
  if (section === 'finance' || section === 'billing') return <div className="grid gap-4 md:grid-cols-3"><WorkspaceCard title="Günlük ciro" value={`₺${tenant.dailyRevenue.toLocaleString('tr-TR')}`} /><WorkspaceCard title="Fatura dönemi" value={tenant.billingPeriod} /><WorkspaceCard title="Yenileme" value={tenant.expiresAt?.slice(0, 10) ?? '-'} /></div>;
  if (section === 'branches') return <ListPanel title="Şubeler" rows={[`${tenant.activeBranchCount} aktif`, `${tenant.branchCount} toplam`]} />;
  if (section === 'ai') return <ListPanel title="AI Analiz" rows={[incidents.length ? 'Olay yükü yükselmiş' : 'Operasyon riski dengeli', devices.some((device) => device.failureCount > 0) ? 'Cihaz güvenilirliği izlenmeli' : 'Cihaz güvenilirliği dengeli']} />;
  return <ListPanel title={section[0].toUpperCase() + section.slice(1)} rows={['Bağlamsal çalışma alanı hazır.', 'Bu alan rota bazlı kademeli yükleme ile ayrıştırıldı.']} />;
}

function WorkspaceMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function WorkspaceCard({ title, value }: { title: string; value: string }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-sm text-slate-400">{title}</p><p className="mt-3 text-2xl font-semibold">{value}</p></article>; }
function ListPanel({ title, rows }: { title: string; rows: string[] }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 grid gap-2">{rows.length ? rows.map((row, index) => <p key={`${title}-${index}`} className="rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-300">{row}</p>) : <p className="text-sm text-slate-400">Kayıt yok.</p>}</div></article>; }
function SidebarBlock({ title, rows }: { title: string; rows: string[] }) { return <section className="mt-5"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-2 grid gap-2">{rows.length ? rows.map((row, index) => <p key={`${title}-${index}`} className="rounded-xl bg-white/[0.035] px-3 py-2 text-xs text-slate-300">{row}</p>) : <p className="text-xs text-slate-500">Kayıt yok.</p>}</div></section>; }
