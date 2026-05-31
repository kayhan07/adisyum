'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Activity, BarChart3, BellRing, BrainCircuit, Building2, Command, Cpu, CreditCard, FileText, HandCoins, LayoutDashboard, Package, Plus, Printer, ReceiptText, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Users, WalletCards, Workflow } from 'lucide-react';
import { getDefaultModulesForPackageType, PACKAGE_MODULE_OPTIONS, type PackageModuleKey } from '@/lib/package-access';
import { secureLogout } from '@/lib/client/secure-logout';
import {
  createAdminTenantDraft,
  createRenewalNotice,
  formatAdminMoney,
  loadSystemAdminState,
  saveSystemAdminState,
  type AdminDealer,
  type AdminFinanceTransaction,
  type AdminInvoice,
  type AdminPackage,
  type AdminPayment,
  type AdminSale,
  type AdminTenant,
  type SystemAdminState,
} from '@/lib/system-admin-store';
import type { PackageType } from '@/lib/saas-store';

type AdminModule = 'command-center' | 'tenants' | 'finance-center' | 'operations' | 'incidents' | 'audit-explorer' | 'observability' | 'jobs' | 'templates' | 'devices' | 'security' | 'analytics' | 'ai-insights' | 'billing' | 'resellers';
type TenantDraft = ReturnType<typeof createAdminTenantDraft>;
type SaasTenantRow = {
  tenantId: string;
  companyName: string;
  legalName?: string | null;
  taxNumber?: string | null;
  status: string;
  deletedAt?: string | null;
  plan: PackageType | string;
  billingPeriod: string;
  subscriptionId?: string | null;
  startsAt?: string | null;
  subscriptionUpdatedAt?: string | null;
  unlimitedLicense?: boolean;
  adminEmail?: string | null;
  adminUsername?: string | null;
  adminActive?: boolean;
  adminPasswordResetRequired?: boolean;
  adminUpdatedAt?: string | null;
  branchCount: number;
  activeBranchCount: number;
  activeUsers: number;
  lastActivity: string;
  expiresAt: string | null;
  subscriptionStatus: string;
  balance: number;
  kontorBalance: number;
  dailyOrders: number;
  dailyRevenue: number;
  lastLogin?: string | null;
  mainBranchId?: string | null;
  createdAt: string;
  productCount?: number;
  categoryCount?: number;
  stockCount?: number;
  recipeCount?: number;
  tableCount?: number;
  orderCount?: number;
  paymentCount?: number;
  salesTotal?: number;
  currentAccountCount?: number;
  cashRecordCount?: number;
  reportCount?: number;
  printerCount?: number;
  runtimeSnapshotCount?: number;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  address?: string | null;
  notes?: string | null;
  lastOrderAt?: string | null;
  lastPaymentAt?: string | null;
  databaseFootprint?: number;
};
type SaasSummary = {
  totalTenants: number;
  activeTenants: number;
  expiredTenants: number;
  totalBranches: number;
  activeUsers: number;
  dailyOrders: number;
  liveRevenue: number;
};
type ProvisioningJobRow = {
  id: string;
  targetTenantId: string;
  status: string;
  currentStep: string;
  attemptCount: number;
  failureReason?: string | null;
  updatedAt: string;
  events?: ProvisioningJobEventRow[];
};
type ProvisioningJobEventRow = {
  id: string;
  type: string;
  severity: string;
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number | null;
  source: string;
  createdAt: string;
};
type ProvisioningMetrics = {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  retryCount: number;
  rollbackCount: number;
  successRate: number;
  retryRate: number;
  rollbackRate: number;
  averageDurationMs: number;
  failuresByStep: Array<{ step: string; count: number }>;
  eventCounts: Array<{ type: string; severity: string; count: number }>;
};
type JobsCenterMetric = {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  dead: number;
};
type JobsCenterRow = {
  id: string;
  queue: string;
  name: string;
  tenantId?: string | null;
  status: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string | null;
  timestamp: number;
};
type TemplatePoolRow = {
  id: string;
  key: string;
  name: string;
  restaurantType: string;
  defaultPrice: string | number;
  version: number;
  categoryTemplateId?: string | null;
  vatRate?: number;
  unitType?: string;
  active?: boolean;
  deprecated?: boolean;
  printerGroupName?: string | null;
  preparationGroup?: string | null;
};
type TemplateImportStat = {
  template: { id: string; name: string; restaurantType: string; version: number } | null;
  importCount: number;
};
type TemplatePackRow = {
  id: string;
  key: string;
  name: string;
  restaurantType: string;
  scale: string;
  version: number;
  active: boolean;
  deprecated: boolean;
  description?: string | null;
};
type RecipeTemplateRow = { id: string; productTemplateId?: string | null; name: string; category?: string | null; yieldQuantity: string | number; unit: string };
type RecipeTemplateItemRow = { id: string; templateId: string; stockTemplateId?: string | null; name: string; quantity: string | number; unit: string };
type StockTemplateRow = { id: string; key: string; name: string; stockUnit: string; recipeUnit: string; purchaseUnit: string; minLevel: string | number };
type CategoryTemplateRow = { id: string; key: string; name: string; sortOrder: number };
type TemplatePackItemRow = { id: string; packId: string; productTemplateId: string; sortOrder: number };
type LivePresenceRow = {
  id: string;
  tenantId: string;
  branchId?: string | null;
  userId: string;
  username: string;
  role: string;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
  ip?: string | null;
  currentRoute?: string | null;
  activeTableId?: string | null;
  status: string;
  heartbeatLatency?: number | null;
  loginAt: string;
  lastSeenAt: string;
};
type LiveDeviceRow = {
  id: string;
  tenantId: string;
  branchId?: string | null;
  deviceId: string;
  deviceType: string;
  status: string;
  failureCount: number;
  latencyMs?: number | null;
  lastHeartbeatAt: string;
  metadata?: Record<string, unknown>;
};
type LiveEventRow = {
  id: string;
  tenantId?: string | null;
  branchId?: string | null;
  type: string;
  severity: string;
  message: string;
  source: string;
  createdAt: string;
};
type LiveOperationsPayload = {
  summary: {
    onlineTenants: number;
    onlineUsers: number;
    onlineBranches: number;
    activeDevices: number;
    activeTables: number;
    activeOrders: number;
    failedLogins24h: number;
  };
  presence: LivePresenceRow[];
  devices: LiveDeviceRow[];
  events: LiveEventRow[];
  activeTablesByTenant: Array<{ tenantId: string; count: number }>;
  generatedAt: string;
};
type HistoricalMetricRow = {
  id: string;
  tenantId: string;
  bucketStart: string;
  bucketSize: string;
  metricType: string;
  eventCount: number;
  sampleCount: number;
  numericValue?: string | number | null;
};
type IncidentRow = {
  id: string;
  tenantId?: string | null;
  type: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  correlationId?: string | null;
  openedAt: string;
  updatedAt: string;
  events?: Array<{ id: string; eventType: string; severity: string; message: string; createdAt: string }>;
};
type IncidentSummary = { total: number; open: number; critical: number; outage: number };
type DurableAuditRow = {
  id: string;
  tenantId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  route?: string | null;
  source: string;
  correlationId?: string | null;
  mutationId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};
type TenantDrawerTab = 'profile' | 'subscription' | 'password' | 'license' | 'data' | 'export' | 'danger';

const navGroups: Array<{ label: string; items: Array<{ id: AdminModule; label: string; icon: typeof LayoutDashboard }> }> = [
  {
    label: 'Yönetim',
    items: [
      { id: 'command-center', label: 'Kontrol Merkezi', icon: LayoutDashboard },
      { id: 'tenants', label: 'Abonelikler', icon: Building2 },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { id: 'operations', label: 'Operasyon Merkezi', icon: Activity },
      { id: 'incidents', label: 'Olay Yönetimi', icon: BellRing },
      { id: 'jobs', label: 'Görev Kuyruğu', icon: Workflow },
      { id: 'devices', label: 'Cihazlar', icon: Printer },
    ],
  },
  {
    label: 'Finans',
    items: [
      { id: 'finance-center', label: 'Finans Merkezi', icon: WalletCards },
      { id: 'billing', label: 'Faturalama', icon: CreditCard },
      { id: 'resellers', label: 'Bayiler', icon: HandCoins },
    ],
  },
  {
    label: 'Analitik',
    items: [
      { id: 'analytics', label: 'Analitik', icon: BarChart3 },
      { id: 'ai-insights', label: 'AI Analiz', icon: BrainCircuit },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { id: 'observability', label: 'Sistem İzleme', icon: Cpu },
      { id: 'audit-explorer', label: 'Denetim Kayıtları', icon: FileText },
      { id: 'security', label: 'Güvenlik Merkezi', icon: ShieldCheck },
      { id: 'templates', label: 'Şablonlar', icon: Sparkles },
    ],
  },
];
const modules = navGroups.flatMap((group) => group.items);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(startDate: string, days: number) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function daysRemaining(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / 86400000);
}

function subscriptionAccessLabel(tenant?: SaasTenantRow | null) {
  if (!tenant) return 'Tenant seçilmedi';
  if (tenant.deletedAt) return 'Silinmiş: erişim kapalı';
  if (tenant.unlimitedLicense) return 'Limitsiz lisans: okuma/yazma açık';
  if (tenant.status === 'expired' || tenant.subscriptionStatus === 'expired') return 'Süresi doldu: okuma açık, yazma kapalı';
  if (tenant.status === 'suspended' || tenant.status === 'blocked' || tenant.status === 'disabled') return 'Erişim kapalı';
  return 'Okuma/yazma açık';
}

function tenantStatusLabel(status?: string | null) {
  if (status === 'active') return 'Aktif';
  if (status === 'trial') return 'Deneme';
  if (status === 'demo') return 'Demo';
  if (status === 'expired') return 'Süresi Doldu';
  if (status === 'suspended') return 'Askıya Alındı';
  if (status === 'blocked' || status === 'disabled') return 'Devre Dışı';
  return status ?? '-';
}

function tenantRemainingDays(tenant?: SaasTenantRow | null) {
  if (!tenant) return null;
  if (tenant.unlimitedLicense) return null;
  return daysRemaining(tenant.expiresAt);
}

function createPackageDraft(packageType: PackageType = 'mini'): AdminPackage {
  return {
    id: `pkg-${Date.now()}`,
    name: '',
    package_type: packageType,
    price: 0,
    duration_days: 30,
    modules: getDefaultModulesForPackageType(packageType),
    features: [],
    active: true,
  };
}

function nextInvoiceNo(invoices: AdminInvoice[]) {
  return `SYS-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`;
}

function LoginCard({ onLogin }: { onLogin: () => void }) {
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    setError('');
    setLoading(true);
    const response = await fetch('/api/auth/system-admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: adminUser, password: adminPass }),
    }).catch(() => null);

    setLoading(false);
    if (!response?.ok) {
      setError('Admin kullanıcı adı veya şifre hatalı.');
      return;
    }

    onLogin();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B1220] p-6 text-white">
      <section className="w-full max-w-md rounded-[1.5rem] border border-white/15 bg-slate-800 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-blue-300" />
          <div>
            <h1 className="text-2xl font-semibold">System Admin ERP</h1>
            <p className="mt-1 text-sm text-slate-300">Satış, fatura ve abonelik kontrol paneli.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          <input value={adminUser} onChange={(event) => setAdminUser(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" />
          <input type="password" value={adminPass} onChange={(event) => setAdminPass(event.target.value)} placeholder="admin123" className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" />
        </div>
        {error ? <p className="mt-3 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
        <button type="button" onClick={() => void login()} className="mt-5 h-12 w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60" disabled={loading}>{loading ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </section>
    </main>
  );
}

export default function SystemAdminPage() {
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeModule, setActiveModule] = useState<AdminModule>('command-center');
  const [state, setState] = useState<SystemAdminState>(() => loadSystemAdminState());
  const [saasTenants, setSaasTenants] = useState<SaasTenantRow[]>([]);
  const [saasSummary, setSaasSummary] = useState<SaasSummary | null>(null);
  const [provisioningJobs, setProvisioningJobs] = useState<ProvisioningJobRow[]>([]);
  const [provisioningMetrics, setProvisioningMetrics] = useState<ProvisioningMetrics | null>(null);
  const [provisioningMessage, setProvisioningMessage] = useState('');
  const [provisioningLoading, setProvisioningLoading] = useState(false);
  const [tenantActionMessage, setTenantActionMessage] = useState('');
  const [tenantActionLoading, setTenantActionLoading] = useState('');
  const [templatePool, setTemplatePool] = useState<TemplatePoolRow[]>([]);
  const [templatePacks, setTemplatePacks] = useState<TemplatePackRow[]>([]);
  const [recipeTemplates, setRecipeTemplates] = useState<RecipeTemplateRow[]>([]);
  const [recipeTemplateItems, setRecipeTemplateItems] = useState<RecipeTemplateItemRow[]>([]);
  const [stockTemplates, setStockTemplates] = useState<StockTemplateRow[]>([]);
  const [categoryTemplates, setCategoryTemplates] = useState<CategoryTemplateRow[]>([]);
  const [templatePackItems, setTemplatePackItems] = useState<TemplatePackItemRow[]>([]);
  const [templateImportStats, setTemplateImportStats] = useState<TemplateImportStat[]>([]);
  const [liveOps, setLiveOps] = useState<LiveOperationsPayload | null>(null);
  const [selectedTenantDrawerId, setSelectedTenantDrawerId] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [savedTenantIds, setSavedTenantIds] = useState<string[]>([]);
  const [incidentRows, setIncidentRows] = useState<IncidentRow[]>([]);
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary | null>(null);
  const [tenantDraft, setTenantDraft] = useState<TenantDraft>(() => createAdminTenantDraft());
  const [dealerDraft, setDealerDraft] = useState<Omit<AdminDealer, 'id'>>({ name: '', type: 'dealer', commission_rate: 20, phone: '', email: '', active: true });
  const [packageDraft, setPackageDraft] = useState<AdminPackage>(() => createPackageDraft());
  const [financeDraft, setFinanceDraft] = useState<Omit<AdminFinanceTransaction, 'id'>>({ type: 'income', source: 'Abonelik tahsilatı', tenant_id: '', amount: 0, date: today(), note: '' });
  const [invoiceDraft, setInvoiceDraft] = useState<Omit<AdminInvoice, 'id' | 'invoice_no'>>({ tenant_id: '', type: 'subscription', amount: 0, status: 'draft', issue_date: today(), due_date: today() });
  const [saleDraft, setSaleDraft] = useState<Omit<AdminSale, 'id' | 'commission_amount' | 'commission_status'>>({ tenant_id: '', package_id: 'pkg-mini', seller: 'Merkez Satış', dealer_id: 'dealer-center', amount: 0, commission_rate: 0, date: today() });
  const [paymentDraft, setPaymentDraft] = useState<Omit<AdminPayment, 'id' | 'status' | 'transaction_id' | 'date'>>({ tenant_id: '', invoice_id: '', amount: 0, provider: 'manual' });

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      const payload = response && response.ok ? await response.json().catch(() => null) : null;
      if (!mounted) return;
      if (payload?.ok && payload?.session?.role === 'super_admin') {
        setAdminLoggedIn(true);
        void loadSaasTenants();
        void loadTemplatePool();
        void loadOperatorMemory();
      }
      setState(loadSystemAdminState());
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!adminLoggedIn) return;
    let cancelled = false;
    async function refreshCommandMetrics() {
      const response = await fetch('/api/system-admin/live-operations', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      const payload = response && response.ok ? await response.json().catch(() => null) as LiveOperationsPayload | null : null;
      if (!cancelled && payload) setLiveOps(payload);
    }
    void refreshCommandMetrics();
    const interval = window.setInterval(() => { void refreshCommandMetrics(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [adminLoggedIn]);

  useEffect(() => {
    if (!adminLoggedIn || activeModule !== 'incidents') return;
    let cancelled = false;
    async function refreshIncidents() {
      if (!cancelled) await loadIncidents();
    }
    void refreshIncidents();
    const interval = window.setInterval(() => { void refreshIncidents(); }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeModule, adminLoggedIn]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
        setSelectedTenantDrawerId('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleAdminLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await secureLogout({ reason: 'manual', scope: 'current', redirect: true });
    setLoggingOut(false);
  }

  function commit(nextState: SystemAdminState) {
    setState(nextState);
    saveSystemAdminState(nextState);
  }

  function packageIdForType(packageType: string) {
    return state.packages.find((pkg) => pkg.package_type === packageType)?.id ?? state.packages[0]?.id ?? 'pkg-mini';
  }

  function mapSaasTenant(row: SaasTenantRow): AdminTenant {
    return {
      id: `db-${row.tenantId}`,
      tenant_id: row.tenantId,
      company_name: row.companyName,
      package_id: packageIdForType(row.plan),
      package_type: (row.plan === 'gold' || row.plan === 'premium' ? row.plan : 'mini') as PackageType,
      start_date: row.createdAt.slice(0, 10),
      end_date: formatDate(row.expiresAt) === '-' ? today() : formatDate(row.expiresAt),
      status: row.status === 'trial' || row.status === 'demo' ? 'demo' : row.status === 'active' ? 'active' : row.status === 'suspended' || row.status === 'blocked' || row.status === 'disabled' ? 'blocked' : 'expired',
      demo_enabled: row.status === 'demo' || row.status === 'trial',
      auto_renew: row.billingPeriod !== 'manual',
      admin_username: 'admin',
      admin_password: '********',
      created_at: row.createdAt,
    };
  }

  async function loadSaasTenants() {
    const response = await fetch('/api/system-admin/tenants', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { tenants?: SaasTenantRow[]; summary?: SaasSummary; jobs?: ProvisioningJobRow[]; provisioningMetrics?: ProvisioningMetrics } | null : null;
    if (!payload?.tenants) return;
    setSaasTenants(payload.tenants);
    setSaasSummary(payload.summary ?? null);
    setProvisioningJobs(payload.jobs ?? []);
    setProvisioningMetrics(payload.provisioningMetrics ?? null);
    const dbTenants = payload.tenants.map(mapSaasTenant);
    setState((current) => {
      const localOnly = current.tenants.filter((tenant) => !dbTenants.some((dbTenant) => dbTenant.tenant_id === tenant.tenant_id));
      const next = { ...current, tenants: [...dbTenants, ...localOnly] };
      saveSystemAdminState(next);
      return next;
    });
  }

  async function loadTemplatePool() {
    const response = await fetch('/api/system-admin/templates', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as {
      templates?: TemplatePoolRow[];
      packs?: TemplatePackRow[];
      recipes?: RecipeTemplateRow[];
      recipeItems?: RecipeTemplateItemRow[];
      stocks?: StockTemplateRow[];
      categories?: CategoryTemplateRow[];
      packItems?: TemplatePackItemRow[];
      importStats?: TemplateImportStat[];
    } | null : null;
    setTemplatePool(payload?.templates ?? []);
    setTemplatePacks(payload?.packs ?? []);
    setRecipeTemplates(payload?.recipes ?? []);
    setRecipeTemplateItems(payload?.recipeItems ?? []);
    setStockTemplates(payload?.stocks ?? []);
    setCategoryTemplates(payload?.categories ?? []);
    setTemplatePackItems(payload?.packItems ?? []);
    setTemplateImportStats(payload?.importStats ?? []);
  }

  async function loadOperatorMemory() {
    const response = await fetch('/api/system-admin/operator-memory?kind=favorite_tenant', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { items?: Array<{ key: string }> } | null : null;
    setSavedTenantIds(payload?.items?.map((item) => item.key) ?? []);
  }

  async function toggleSavedTenant(tenantId: string) {
    const saved = savedTenantIds.includes(tenantId);
    setSavedTenantIds((current) => saved ? current.filter((id) => id !== tenantId) : [...current, tenantId]);
    await fetch('/api/system-admin/operator-memory', {
      method: saved ? 'DELETE' : 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'favorite_tenant', key: tenantId, label: tenantId }),
    }).catch(() => null);
  }

  async function loadIncidents() {
    const response = await fetch('/api/system-admin/incidents', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { incidents?: IncidentRow[]; summary?: IncidentSummary } | null : null;
    setIncidentRows(payload?.incidents ?? []);
    setIncidentSummary(payload?.summary ?? null);
  }

  function selectedPackage(packageId: string) {
    return state.packages.find((item) => item.id === packageId) ?? state.packages[0];
  }

  function selectedDealer(dealerId?: string) {
    return state.dealers.find((item) => item.id === dealerId) ?? state.dealers[0];
  }

  const dashboard = useMemo(() => {
    const income = state.finance.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = state.finance.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    const revenue = state.payments.filter((item) => item.status === 'success').reduce((sum, item) => sum + item.amount, 0);
    const activeSubscriptions = state.tenants.filter((tenant) => tenant.status === 'active' || tenant.status === 'demo').length;
    const commissions = state.commissions.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.amount, 0);
    const pendingPayments = state.payments.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0);
    const pendingCommissions = state.commissions.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0);
    const unpaidInvoices = state.invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').reduce((sum, invoice) => sum + invoice.amount, 0);
    return { income, expense, net: income - expense, revenue, activeSubscriptions, commissions, pendingPayments, pendingCommissions, unpaidInvoices };
  }, [state]);

  async function saveTenant() {
    const pkg = selectedPackage(tenantDraft.package_id);
    if (!tenantDraft.company_name.trim() || !tenantDraft.admin_username.trim() || !tenantDraft.admin_password.trim()) {
      setProvisioningMessage('Tenant oluşturmak için firma adı, admin kullanıcı adı ve şifre zorunlu.');
      return;
    }
    setProvisioningLoading(true);
    setProvisioningMessage('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/system-admin/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          tenantId: tenantDraft.tenant_id,
          companyName: tenantDraft.company_name.trim(),
          legalName: tenantDraft.legal_name?.trim() || tenantDraft.company_name.trim(),
          taxNumber: tenantDraft.tax_number?.trim() || undefined,
          phone: tenantDraft.phone?.trim() || undefined,
          email: tenantDraft.email?.trim() || undefined,
          contactName: tenantDraft.contact_name?.trim() || undefined,
          address: tenantDraft.address?.trim() || undefined,
          notes: tenantDraft.notes?.trim() || undefined,
          packageType: pkg.package_type,
          billingPeriod: 'monthly',
          status: tenantDraft.demo_enabled ? 'trial' : tenantDraft.status === 'expired' ? 'cancelled' : tenantDraft.status === 'blocked' ? 'suspended' : 'active',
          startsAt: tenantDraft.start_date,
          endsAt: tenantDraft.end_date || addDays(tenantDraft.start_date, pkg.duration_days),
          branchId: 'mrk',
          branchName: 'Merkez Şube',
          adminUsername: tenantDraft.admin_username.trim(),
          adminPassword: tenantDraft.admin_password.trim(),
          adminName: 'Tenant Admin',
          adminEmail: tenantDraft.email?.trim() || undefined,
          initialBalance: 0,
          kontorBalance: 0,
        }),
      }).catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Tenant oluşturma isteği zaman aşımına uğradı. Sayfa kilitlenmedi; lütfen job durumunu kontrol edin.');
        }
        throw error;
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string | null; queued?: boolean; job?: ProvisioningJobRow; tenants?: SaasTenantRow[]; jobs?: ProvisioningJobRow[]; provisioningMetrics?: ProvisioningMetrics } | null;
      if (!response.ok || !payload?.ok) {
        setProvisioningMessage(payload?.error ?? 'Tenant provision edilemedi.');
        return;
      }
      if (payload.tenants) {
        setSaasTenants(payload.tenants);
        const dbTenants = payload.tenants.map(mapSaasTenant);
        commit({ ...state, tenants: dbTenants });
      }
      setProvisioningJobs(payload.jobs ?? []);
      setProvisioningMetrics(payload.provisioningMetrics ?? null);
      const targetTenantId = payload.job?.targetTenantId ?? tenantDraft.tenant_id;
      setProvisioningMessage(payload.queued === false
        ? `Tenant job oluşturuldu fakat kuyruk beklemede: ${targetTenantId}. ${payload.warning ?? ''}`.trim()
        : `Tenant provisioning kuyruğa alındı: ${targetTenantId}.`);
      setTenantDraft(createAdminTenantDraft());
    } catch (error) {
      console.error('[system-admin] tenant creation failed', {
        tenantId: tenantDraft.tenant_id,
        error: error instanceof Error ? error.message : String(error),
      });
      setProvisioningMessage(error instanceof Error ? error.message : 'Tenant oluşturma başarısız.');
    } finally {
      clearTimeout(timeout);
      setProvisioningLoading(false);
    }
  }

  async function runProvisioningAction(jobId: string, action: 'retry' | 'rollback') {
    const response = await fetch('/api/system-admin/tenants', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, action }),
    });
    const payload = await response.json().catch(() => null) as { jobs?: ProvisioningJobRow[]; provisioningMetrics?: ProvisioningMetrics; error?: string } | null;
    setProvisioningMessage(response.ok ? `Provisioning ${action} tamamlandı.` : payload?.error ?? 'Provisioning aksiyonu başarısız.');
    if (payload?.jobs) setProvisioningJobs(payload.jobs);
    if (payload?.provisioningMetrics) setProvisioningMetrics(payload.provisioningMetrics);
    if (response.ok) await loadSaasTenants();
  }

  async function runTenantManagementAction(tenantId: string, body: Record<string, unknown>, options?: { closeDrawer?: boolean }) {
    const action = String(body.action ?? 'unknown');
    const context = { tenantId, action, timestamp: new Date().toISOString() };
    setTenantActionLoading(`${tenantId}:${action}`);
    setTenantActionMessage('');
    try {
      const response = await fetch('/api/system-admin/tenants', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, ...body }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        console.error('[system-admin] tenant management action failed', { ...context, status: response.status, error: payload?.error });
        setTenantActionMessage(payload?.error ?? 'İşlem başarısız.');
        return false;
      }
      setTenantActionMessage('İşlem başarılı.');
      await loadSaasTenants();
      if (options?.closeDrawer) setSelectedTenantDrawerId('');
      return true;
    } catch (error) {
      console.error('[system-admin] tenant management action failed', { ...context, error: error instanceof Error ? error.message : String(error) });
      setTenantActionMessage('İşlem başarısız.');
      return false;
    } finally {
      setTenantActionLoading('');
    }
  }

  function saveDealer() {
    if (!dealerDraft.name.trim()) return;
    commit({ ...state, dealers: [{ id: `dealer-${Date.now()}`, ...dealerDraft }, ...state.dealers] });
    setDealerDraft({ name: '', type: 'dealer', commission_rate: 20, phone: '', email: '', active: true });
  }

  function savePackage() {
    if (!packageDraft.name.trim() || packageDraft.modules.length === 0) return;
    const exists = state.packages.some((item) => item.id === packageDraft.id);
    const nextPackages = exists
      ? state.packages.map((item) => item.id === packageDraft.id ? { ...packageDraft } : item)
      : [{ ...packageDraft }, ...state.packages];
    commit({ ...state, packages: nextPackages });
    setPackageDraft(createPackageDraft());
  }

  function editPackage(pkg: AdminPackage) {
    setPackageDraft({ ...pkg, modules: [...pkg.modules], features: [...pkg.features] });
  }

  function resetPackageDraft() {
    setPackageDraft(createPackageDraft());
  }

  function deletePackage(packageId: string) {
    if (state.tenants.some((tenant) => tenant.package_id === packageId)) return;
    const nextPackages = state.packages.filter((pkg) => pkg.id !== packageId);
    if (nextPackages.length === 0) return;
    commit({ ...state, packages: nextPackages });
    if (packageDraft.id === packageId) setPackageDraft(createPackageDraft());
  }

  function addSale() {
    if (!saleDraft.tenant_id || saleDraft.amount <= 0) return;
    const dealer = selectedDealer(saleDraft.dealer_id);
    const commissionRate = saleDraft.commission_rate || dealer?.commission_rate || 0;
    const commissionAmount = Number(((saleDraft.amount * commissionRate) / 100).toFixed(2));
    const saleId = `sale-${Date.now()}`;
    const sale: AdminSale = { id: saleId, ...saleDraft, dealer_id: dealer?.id, seller: dealer?.name ?? saleDraft.seller, commission_rate: commissionRate, commission_amount: commissionAmount, commission_status: commissionAmount > 0 ? 'pending' : 'paid' };
    const commission = { id: `com-${Date.now()}`, sale_id: saleId, dealer_id: dealer?.id ?? '', tenant_id: sale.tenant_id, amount: commissionAmount, rate: commissionRate, status: sale.commission_status, due_date: addDays(today(), 7) } as const;
    commit({ ...state, sales: [sale, ...state.sales], commissions: [commission, ...state.commissions] });
    setSaleDraft({ tenant_id: '', package_id: 'pkg-mini', seller: 'Merkez Satış', dealer_id: 'dealer-center', amount: 0, commission_rate: 0, date: today() });
  }

  function processPayment(success: boolean) {
    if (!paymentDraft.tenant_id || paymentDraft.amount <= 0) return;
    const payment: AdminPayment = {
      id: `pay-${Date.now()}`,
      ...paymentDraft,
      invoice_id: paymentDraft.invoice_id || undefined,
      status: success ? 'success' : 'failed',
      transaction_id: `${paymentDraft.provider.toUpperCase()}-${Date.now()}`,
      date: today(),
      error: success ? undefined : 'Ödeme sağlayıcı başarısız yanıt döndürdü.',
    };

    let nextState: SystemAdminState = {
      ...state,
      payments: [payment, ...state.payments],
    };

    if (success) {
      const tenant = state.tenants.find((item) => item.tenant_id === payment.tenant_id);
      const pkg = tenant ? selectedPackage(tenant.package_id) : null;
      const oldEndDate = tenant?.end_date ?? today();
      const newEndDate = pkg ? addDays(oldEndDate, pkg.duration_days) : oldEndDate;
      const invoice: AdminInvoice = {
        id: `inv-${Date.now()}`,
        invoice_no: nextInvoiceNo(state.invoices),
        tenant_id: payment.tenant_id,
        type: 'subscription',
        amount: payment.amount,
        status: 'paid',
        issue_date: today(),
        due_date: today(),
      };
      nextState = {
        ...nextState,
        invoices: [invoice, ...state.invoices.map((item) => item.id === payment.invoice_id ? { ...item, status: 'paid' as const } : item)],
        finance: [{ id: `fin-${Date.now()}`, type: 'income', source: 'Online ödeme', tenant_id: payment.tenant_id, amount: payment.amount, date: today(), note: payment.transaction_id }, ...state.finance],
        renewals: tenant ? [{ id: `ren-${Date.now()}`, tenant_id: tenant.tenant_id, old_end_date: oldEndDate, new_end_date: newEndDate, payment_id: payment.id, status: 'completed', completed_at: today() }, ...state.renewals] : state.renewals,
        tenants: tenant ? state.tenants.map((item) => item.tenant_id === tenant.tenant_id ? { ...item, end_date: newEndDate, status: item.demo_enabled ? 'demo' : 'active' } : item) : state.tenants,
      };
    }

    commit(nextState);
    setPaymentDraft({ tenant_id: '', invoice_id: '', amount: 0, provider: 'manual' });
  }

  function addFinanceTransaction() {
    if (!financeDraft.source.trim() || financeDraft.amount <= 0) return;
    commit({ ...state, finance: [{ id: `fin-${Date.now()}`, ...financeDraft }, ...state.finance] });
    setFinanceDraft({ type: 'income', source: 'Abonelik tahsilatı', tenant_id: '', amount: 0, date: today(), note: '' });
  }

  function addInvoice() {
    if (!invoiceDraft.tenant_id || invoiceDraft.amount <= 0) return;
    commit({ ...state, invoices: [{ id: `inv-${Date.now()}`, invoice_no: nextInvoiceNo(state.invoices), ...invoiceDraft }, ...state.invoices] });
    setInvoiceDraft({ tenant_id: '', type: 'subscription', amount: 0, status: 'draft', issue_date: today(), due_date: today() });
  }

  async function handleSystemAdminLogin() {
    const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { session?: { tenantId?: string; role?: string } } | null : null;
    if (payload?.session?.tenantId !== 'system' || payload.session.role !== 'super_admin') {
      setAdminLoggedIn(false);
      return;
    }
    setAdminLoggedIn(true);
    await Promise.all([loadSaasTenants(), loadTemplatePool()]);
  }

  if (!adminLoggedIn) return <LoginCard onLogin={() => void handleSystemAdminLogin()} />;

  return (
    <main className="min-h-screen bg-[#08111d] text-white">
      <div className="grid min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-[#0d1626] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Adisyum Control Tower</p>
          <h1 className="mt-2 text-2xl font-semibold">System Admin</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">SaaS operasyon, gelir ve tenant zekası.</p>
          <nav className="mt-8 grid gap-6">
            {navGroups.map((group, index) => (
              <details key={group.label} open={index < 3} className="group">
                <summary className="mb-2 cursor-pointer list-none px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{group.label}</summary>
                <div className="grid gap-2">
                  {group.items.map((module) => {
                    const Icon = module.icon;
                    const active = activeModule === module.id;
                    return (
                      <button key={module.id} type="button" onClick={() => setActiveModule(module.id)} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${active ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/30' : 'text-slate-300 hover:bg-white/6'}`}>
                        <Icon className="h-4.5 w-4.5" />
                        {module.label}
                      </button>
                    );
                  })}
                </div>
              </details>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <CommandBar dashboard={dashboard} saasSummary={saasSummary} provisioningMetrics={provisioningMetrics} liveOps={liveOps} state={state} />
          <div className="p-6">
            <header className="flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">SaaS operations</p>
                <h2 className="mt-2 text-3xl font-semibold">{modules.find((item) => item.id === activeModule)?.label}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
                  <Command className="h-4 w-4" />
                  Komut paleti
                </button>
                <Link href="/system-admin/release-operations" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">
                  <RefreshCw className="h-4 w-4" />
                  Release Operations
                </Link>
                <Link href="/system-admin/disaster-recovery" className="inline-flex items-center gap-2 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100">
                  <ShieldCheck className="h-4 w-4" />
                  Disaster Recovery
                </Link>
                <button
                  type="button"
                  onClick={() => void handleAdminLogout()}
                  disabled={loggingOut}
                  className="rounded-2xl border border-rose-300/35 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 disabled:opacity-60"
                >
                  {loggingOut ? 'Çıkılıyor…' : 'Güvenli Çıkış'}
                </button>
              </div>
            </header>

          {activeModule === 'command-center' ? <CommandCenter dashboard={dashboard} state={state} saasSummary={saasSummary} liveOps={liveOps} provisioningJobs={provisioningJobs} /> : null}
          {activeModule === 'tenants' ? <TenantsModule state={state} saasTenants={saasTenants} provisioningJobs={provisioningJobs} provisioningMetrics={provisioningMetrics} tenantDraft={tenantDraft} setTenantDraft={setTenantDraft} selectedPackage={selectedPackage} saveTenant={saveTenant} runProvisioningAction={runProvisioningAction} commit={commit} provisioningLoading={provisioningLoading} provisioningMessage={provisioningMessage} tenantActionLoading={tenantActionLoading} tenantActionMessage={tenantActionMessage} liveOps={liveOps} onOpenTenant={setSelectedTenantDrawerId} onTenantAction={runTenantManagementAction} savedTenantIds={savedTenantIds} onToggleSavedTenant={toggleSavedTenant} /> : null}
          {activeModule === 'incidents' ? <IncidentCenter incidents={incidentRows} summary={incidentSummary} refresh={loadIncidents} onOpenTenant={setSelectedTenantDrawerId} /> : null}
          {activeModule === 'audit-explorer' ? <AuditExplorer /> : null}
          {activeModule === 'jobs' ? <JobsCenterModule /> : null}
          {activeModule === 'operations' ? <LiveOperationsModule /> : null}
          {activeModule === 'templates' ? <TemplatesModule templates={templatePool} packs={templatePacks} recipes={recipeTemplates} recipeItems={recipeTemplateItems} stocks={stockTemplates} categories={categoryTemplates} packItems={templatePackItems} importStats={templateImportStats} reload={loadTemplatePool} /> : null}
          {activeModule === 'finance-center' ? <FinanceCenter state={state} dashboard={dashboard} saleDraft={saleDraft} setSaleDraft={setSaleDraft} addSale={addSale} paymentDraft={paymentDraft} setPaymentDraft={setPaymentDraft} processPayment={processPayment} financeDraft={financeDraft} setFinanceDraft={setFinanceDraft} addFinanceTransaction={addFinanceTransaction} invoiceDraft={invoiceDraft} setInvoiceDraft={setInvoiceDraft} addInvoice={addInvoice} /> : null}
          {activeModule === 'observability' ? <MonitoringModule /> : null}
          {activeModule === 'devices' ? <DeviceCenter liveOps={liveOps} /> : null}
          {activeModule === 'security' ? <SecurityCenter liveOps={liveOps} /> : null}
          {activeModule === 'analytics' ? <ReportsModule state={state} dashboard={dashboard} /> : null}
          {activeModule === 'ai-insights' ? <AiInsightsCenter state={state} saasTenants={saasTenants} liveOps={liveOps} /> : null}
          {activeModule === 'billing' ? <BillingCenter state={state} packageDraft={packageDraft} setPackageDraft={setPackageDraft} savePackage={savePackage} editPackage={editPackage} resetPackageDraft={resetPackageDraft} deletePackage={deletePackage} /> : null}
          {activeModule === 'resellers' ? <ResellerCenter state={state} dealerDraft={dealerDraft} setDealerDraft={setDealerDraft} saveDealer={saveDealer} commit={commit} /> : null}
          </div>
        </section>
      </div>
      {selectedTenantDrawerId ? <TenantOperationsDrawer tenantId={selectedTenantDrawerId} tenant={saasTenants.find((item) => item.tenantId === selectedTenantDrawerId) ?? null} liveOps={liveOps} provisioningJobs={provisioningJobs} state={state} onRefresh={loadSaasTenants} onClose={() => setSelectedTenantDrawerId('')} /> : null}
      {commandPaletteOpen ? <CommandPalette tenants={saasTenants} onClose={() => setCommandPaletteOpen(false)} onSelectTenant={(tenantId) => { setSelectedTenantDrawerId(tenantId); setActiveModule('tenants'); setCommandPaletteOpen(false); }} /> : null}
    </main>
  );
}

function CommandBar({ dashboard, saasSummary, provisioningMetrics, liveOps, state }: { dashboard: any; saasSummary: SaasSummary | null; provisioningMetrics: ProvisioningMetrics | null; liveOps: LiveOperationsPayload | null; state: SystemAdminState }) {
  const expiring = state.tenants.filter((tenant) => {
    const daysLeft = Math.ceil((new Date(tenant.end_date).getTime() - Date.now()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 7;
  }).length;
  const metrics = [
    ['Aktif tenant', String(saasSummary?.activeTenants ?? dashboard.activeSubscriptions)],
    ['Online kullanıcı', String(liveOps?.summary.onlineUsers ?? 0)],
    ['MRR', formatAdminMoney(state.packages.reduce((sum, pkg) => sum + pkg.price, 0))],
    ['Bugün ciro', formatAdminMoney(saasSummary?.liveRevenue ?? dashboard.revenue)],
    ['Yakın yenileme', String(expiring)],
    ['Failed payment', String(state.payments.filter((payment) => payment.status === 'failed').length)],
    ['Aktif onboarding', String(provisioningMetrics?.activeJobs ?? 0)],
    ['Aktif masa', String(liveOps?.summary.activeTables ?? 0)],
    ['Incident', String(liveOps?.summary.failedLogins24h ?? 0)],
  ];
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-[#08111d]/95 px-6 py-3 backdrop-blur">
      <div className="flex gap-3 overflow-x-auto">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-[140px] rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandCenter({ dashboard, state, saasSummary, liveOps, provisioningJobs }: { dashboard: any; state: SystemAdminState; saasSummary: SaasSummary | null; liveOps: LiveOperationsPayload | null; provisioningJobs: ProvisioningJobRow[] }) {
  const latestEvents = liveOps?.events.slice(0, 8) ?? [];
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam tenant" value={String(saasSummary?.totalTenants ?? state.tenants.length)} />
        <Metric label="Canlı ciro" value={formatAdminMoney(saasSummary?.liveRevenue ?? dashboard.revenue)} />
        <Metric label="Aktif sipariş" value={String(liveOps?.summary.activeOrders ?? 0)} />
        <Metric label="Failed onboarding" value={String(provisioningJobs.filter((job) => job.status === 'failed').length)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Live activity</p>
          <h3 className="mt-2 text-xl font-semibold">Operasyon akışı</h3>
          <div className="mt-4 grid gap-3">
            {latestEvents.length ? latestEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.035] p-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
                <div className="min-w-0">
                  <p className="font-medium">{event.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{event.type} / {event.tenantId ?? 'global'} / {new Date(event.createdAt).toLocaleTimeString('tr-TR')}</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">Henüz canlı operasyon olayı yok.</p>}
          </div>
        </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Control posture</p>
          <h3 className="mt-2 text-xl font-semibold">Anlık sağlık</h3>
          <div className="mt-4 grid gap-3">
            {[
              ['Online tenant', liveOps?.summary.onlineTenants ?? 0],
              ['Aktif cihaz', liveOps?.summary.activeDevices ?? 0],
              ['Online şube', liveOps?.summary.onlineBranches ?? 0],
              ['Başarısız giriş / 24s', liveOps?.summary.failedLogins24h ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function Dashboard({ dashboard, state, saasSummary }: { dashboard: any; state: SystemAdminState; saasSummary: SaasSummary | null }) {
  const operationalMetrics = saasSummary
    ? [
      ['Toplam tenant', saasSummary.totalTenants],
      ['Aktif tenant', saasSummary.activeTenants],
      ['Aktif kullanıcı', saasSummary.activeUsers],
      ['Günlük sipariş', saasSummary.dailyOrders],
      ['Canlı ciro', formatAdminMoney(saasSummary.liveRevenue)],
    ]
    : [
      ['Toplam gelir', formatAdminMoney(dashboard.revenue)],
      ['Aktif abonelik', dashboard.activeSubscriptions],
      ['Komisyon', formatAdminMoney(dashboard.commissions)],
      ['Bekleyen ödeme', formatAdminMoney(dashboard.pendingPayments)],
      ['Bekleyen hak ediş', formatAdminMoney(dashboard.pendingCommissions)],
    ];

  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {operationalMetrics.map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}
      </div>
      <DataTable headers={['Abone', 'Bitiş', 'Yenileme', 'Uyarı']} rows={state.tenants.map((tenant) => [tenant.company_name, tenant.end_date, tenant.auto_renew ? 'Otomatik' : 'Manuel', createRenewalNotice(tenant)])} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function DomainTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (value: T) => void; tabs: Array<[T, string]> }) {
  return <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025] p-2">
    {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => onChange(id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${value === id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}>{label}</button>)}
  </div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900">
      <div className="overflow-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.18em] text-slate-400"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-white/10">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 text-slate-200">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function TenantsModule({ saasTenants, liveOps, onOpenTenant, onTenantAction, tenantActionLoading, tenantActionMessage }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [renewalFilter, setRenewalFilter] = useState('all');
  const [localMessage, setLocalMessage] = useState('');

  const visibleSubscriptions = saasTenants.filter((tenant: SaasTenantRow) => {
    const haystack = `${tenant.companyName} ${tenant.tenantId} ${tenant.adminEmail ?? ''} ${tenant.email ?? ''} ${tenant.taxNumber ?? ''}`.toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.toLowerCase());
    const isDeleted = Boolean(tenant.deletedAt);
    const matchesStatus = statusFilter === 'all'
      ? !isDeleted
      : statusFilter === 'deleted'
        ? isDeleted
        : statusFilter === 'unlimited'
          ? tenant.unlimitedLicense === true && !isDeleted
          : statusFilter === 'disabled'
            ? (tenant.status === 'blocked' || tenant.status === 'disabled') && !isDeleted
            : tenant.status === statusFilter && !isDeleted;
    const matchesPackage = packageFilter === 'all' || tenant.plan === packageFilter;
    const renewalDate = tenant.expiresAt ? new Date(tenant.expiresAt) : null;
    const daysToRenewal = renewalDate ? Math.ceil((renewalDate.getTime() - Date.now()) / 86400000) : null;
    const matchesRenewal = renewalFilter === 'all'
      || (renewalFilter === 'soon' && daysToRenewal !== null && daysToRenewal <= 30)
      || (renewalFilter === 'expired' && daysToRenewal !== null && daysToRenewal < 0);
    return matchesSearch && matchesStatus && matchesPackage && matchesRenewal;
  });

  const packageOptions: string[] = Array.from(new Set<string>(saasTenants.map((tenant: SaasTenantRow) => String(tenant.plan))));
  const tenantStats = [
    ['Toplam Abone', String(saasTenants.filter((tenant: SaasTenantRow) => !tenant.deletedAt).length)],
    ['Aktif Abone', String(saasTenants.filter((tenant: SaasTenantRow) => !tenant.deletedAt && tenant.status === 'active').length)],
    ['Süresi Dolan', String(saasTenants.filter((tenant: SaasTenantRow) => !tenant.deletedAt && (tenant.status === 'expired' || tenant.subscriptionStatus === 'expired')).length)],
    ['Askıya Alınan', String(saasTenants.filter((tenant: SaasTenantRow) => !tenant.deletedAt && tenant.status === 'suspended').length)],
    ['Limitsiz Lisans', String(saasTenants.filter((tenant: SaasTenantRow) => !tenant.deletedAt && tenant.unlimitedLicense).length)],
    ['Silinmiş Abone', String(saasTenants.filter((tenant: SaasTenantRow) => tenant.deletedAt).length)],
  ];

  async function quickAction(tenant: SaasTenantRow, actionBody: Record<string, unknown>, options?: { confirmDelete?: boolean }) {
    setLocalMessage('');
    if (options?.confirmDelete) {
      const confirmation = window.prompt('Bu işlem abonenin erişimini kapatır. Veriler korunur. Devam etmek için abone kodunu yazın.');
      if (confirmation === null) return;
      if (confirmation.trim().toUpperCase() !== tenant.tenantId.toUpperCase()) {
        setLocalMessage('Abone kodu doğrulanmadı. Silme yapılmadı.');
        return;
      }
      await onTenantAction?.(tenant.tenantId, { ...actionBody, confirmationTenantId: confirmation.trim() });
      return;
    }
    await onTenantAction?.(tenant.tenantId, actionBody);
  }

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Abone Yönetim Merkezi</h2>
          <p className="mt-1 text-sm text-slate-400">Aboneleri, lisansları, riskli işlemleri ve tenant sağlığını tek panelden yönetin.</p>
        </div>
        <Link href="/system-admin/onboarding" className="rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100">Yeni Abonelik Oluştur</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tenantStats.map(([label, value]) => <MiniMetric key={label} label={label} value={value} />)}
      </div>

      <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-900 p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Firma adı, abone kodu, e-posta veya vergi no ara..." className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm outline-none" />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-dark">
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="expired">Süresi Doldu</option>
          <option value="suspended">Askıya Alındı</option>
          <option value="disabled">Devre Dışı</option>
          <option value="unlimited">Limitsiz</option>
          <option value="deleted">Silinmiş</option>
        </select>
        <select value={packageFilter} onChange={(event) => setPackageFilter(event.target.value)} className="input-dark">
          <option value="all">Tüm paketler</option>
          {packageOptions.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
        </select>
        <select value={renewalFilter} onChange={(event) => setRenewalFilter(event.target.value)} className="input-dark">
          <option value="all">Tüm yenilemeler</option>
          <option value="soon">Yakında bitecek</option>
          <option value="expired">Süresi dolmuş</option>
        </select>
      </div>

      {tenantActionMessage ? <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{tenantActionMessage}</p> : null}
      {localMessage ? <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{localMessage}</p> : null}

      <DataTable
        headers={['Abone Kodu', 'Firma Adı', 'Admin E-posta', 'Telefon', 'Vergi No', 'Durum', 'Abonelik', 'Bitiş Tarihi', 'Kalan Gün', 'Limitsiz', 'Son Giriş', 'İşlemler']}
        rows={visibleSubscriptions.map((tenant: SaasTenantRow) => {
          const remaining = tenantRemainingDays(tenant);
          const rowBusy = typeof tenantActionLoading === 'string' && tenantActionLoading.startsWith(`${tenant.tenantId}:`);
          return [
            <button key={`${tenant.tenantId}-code`} type="button" onClick={() => onOpenTenant?.(tenant.tenantId)} className="font-semibold text-cyan-100">{tenant.tenantId}</button>,
            <button key={`${tenant.tenantId}-company`} type="button" onClick={() => onOpenTenant?.(tenant.tenantId)} className="block rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
              <p className="font-semibold">{tenant.companyName}</p>
              <p className="text-xs text-slate-400">{tenant.taxNumber || tenant.plan}</p>
            </button>,
            tenant.adminEmail ?? tenant.email ?? '-',
            tenant.phone ?? '-',
            tenant.taxNumber ?? '-',
            <StatusPill key={`${tenant.tenantId}-status`} status={tenant.status} />,
            tenant.unlimitedLicense ? 'Limitsiz' : tenant.subscriptionStatus,
            formatDate(tenant.expiresAt),
            tenant.unlimitedLicense ? 'Limitsiz' : remaining ?? '-',
            tenant.unlimitedLicense ? 'Evet' : 'Hayır',
            formatDate(tenant.lastLogin),
            <div key={`${tenant.tenantId}-actions`} className="flex min-w-[220px] flex-wrap gap-2">
              <button type="button" onClick={() => onOpenTenant?.(tenant.tenantId)} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">Yönet</button>
              <button disabled={rowBusy || Boolean(tenant.deletedAt) || tenant.status === 'suspended'} type="button" onClick={() => void quickAction(tenant, { action: 'update_status', tenantStatus: 'suspended' })} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">Askıya Al</button>
              <button disabled={rowBusy || Boolean(tenant.deletedAt) || tenant.status === 'active'} type="button" onClick={() => void quickAction(tenant, { action: 'update_status', tenantStatus: 'active' })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50">Aktif Yap</button>
              <button disabled={rowBusy || Boolean(tenant.deletedAt)} type="button" onClick={() => void quickAction(tenant, { action: 'soft_delete_tenant' }, { confirmDelete: true })} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100 disabled:opacity-50">Sil</button>
            </div>,
          ];
        })}
      />
      <p className="text-sm text-slate-400">{visibleSubscriptions.length} abonelik gösteriliyor.</p>
    </div>
  );
}
function JobsCenterModule() {
  const [metrics, setMetrics] = useState<JobsCenterMetric[]>([]);
  const [jobs, setJobs] = useState<JobsCenterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    const response = await fetch('/api/system-admin/jobs', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { metrics?: JobsCenterMetric[]; jobs?: JobsCenterRow[] } | null : null;
    if (!response?.ok || !payload) {
      setError('Jobs Center verisi alınamadı.');
      setLoading(false);
      return;
    }
    setMetrics(payload.metrics ?? []);
    setJobs(payload.jobs ?? []);
    setError('');
    setLoading(false);
  }

  async function act(action: 'retry' | 'clear_failed', queue: string, jobId?: string) {
    await fetch('/api/system-admin/jobs', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, queue, jobId }),
    });
    await refresh();
  }

  useEffect(() => {
    void refresh();
    const stream = new EventSource('/api/system-admin/jobs/stream', { withCredentials: true });
    stream.addEventListener('jobs', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { metrics?: JobsCenterMetric[]; jobs?: JobsCenterRow[] };
      setMetrics(payload.metrics ?? []);
      setJobs(payload.jobs ?? []);
      setError('');
      setLoading(false);
    });
    stream.addEventListener('error', () => {
      setError('Canlı job stream bağlantısı kesildi; manuel yenileme kullanılabilir.');
    });
    return () => stream.close();
  }, []);

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Operations</p>
          <h2 className="mt-2 text-2xl font-semibold">Jobs Center</h2>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded-xl bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/35">Yenile</button>
      </div>
      {error ? <p className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.queue} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold capitalize">{metric.queue.replaceAll('-', ' ')}</p>
              {metric.dead ? <button type="button" onClick={() => void act('clear_failed', metric.queue)} className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-200">DLQ temizle</button> : null}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              <div><p className="text-lg font-bold text-blue-200">{metric.waiting}</p><p className="text-slate-500">Bekleyen</p></div>
              <div><p className="text-lg font-bold text-amber-200">{metric.active}</p><p className="text-slate-500">Aktif</p></div>
              <div><p className="text-lg font-bold text-emerald-200">{metric.completed}</p><p className="text-slate-500">Biten</p></div>
              <div><p className="text-lg font-bold text-rose-200">{metric.dead}</p><p className="text-slate-500">Dead</p></div>
            </div>
          </div>
        ))}
      </div>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Worker stream</p>
            <h3 className="mt-2 text-xl font-semibold">Son joblar</h3>
          </div>
          {loading ? <span className="text-xs text-blue-200">Yenileniyor</span> : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr>{['Queue', 'Job', 'Tenant', 'Durum', 'Attempt', 'Hata', 'Zaman', 'Aksiyon'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={`${job.queue}:${job.id}`} className="border-t border-white/10">
                  <td className="px-3 py-3">{job.queue}</td>
                  <td className="px-3 py-3"><p className="font-semibold">{job.name}</p><p className="text-xs text-slate-500">{job.id}</p></td>
                  <td className="px-3 py-3">{job.tenantId ?? '-'}</td>
                  <td className="px-3 py-3">{job.status}</td>
                  <td className="px-3 py-3">{job.attemptsMade}/{job.maxAttempts}</td>
                  <td className="max-w-[220px] truncate px-3 py-3 text-slate-400">{job.failedReason ?? '-'}</td>
                  <td className="px-3 py-3 text-slate-400">{new Date(job.timestamp).toLocaleTimeString('tr-TR')}</td>
                  <td className="px-3 py-3">{job.status === 'failed' ? <button type="button" onClick={() => void act('retry', job.queue, job.id)} className="rounded-lg bg-blue-600 px-2 py-1 text-xs">Retry</button> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function FinanceCenter({ state, dashboard, saleDraft, setSaleDraft, addSale, paymentDraft, setPaymentDraft, processPayment, financeDraft, setFinanceDraft, addFinanceTransaction, invoiceDraft, setInvoiceDraft, addInvoice }: any) {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'payments' | 'invoices' | 'collections' | 'reports'>('overview');
  const arr = dashboard.revenue * 12;
  const failedPayments = state.payments.filter((payment: AdminPayment) => payment.status === 'failed').length;
  const unpaidInvoices = state.invoices.filter((invoice: AdminInvoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').length;
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="MRR" value={formatAdminMoney(dashboard.revenue)} />
        <Metric label="ARR" value={formatAdminMoney(arr)} />
        <Metric label="Failed payment" value={String(failedPayments)} />
        <Metric label="Ödenmemiş fatura" value={String(unpaidInvoices)} />
      </div>
      <DomainTabs value={activeTab} onChange={setActiveTab} tabs={[
        ['overview', 'Genel Bakış'],
        ['sales', 'Satışlar'],
        ['payments', 'Ödemeler'],
        ['invoices', 'Faturalar'],
        ['collections', 'Tahsilatlar'],
        ['reports', 'Raporlar'],
      ]} />
      {activeTab === 'overview' ? <div className="grid gap-5 xl:grid-cols-2"><SalesModule state={state} saleDraft={saleDraft} setSaleDraft={setSaleDraft} addSale={addSale} /><PaymentsModule state={state} paymentDraft={paymentDraft} setPaymentDraft={setPaymentDraft} processPayment={processPayment} /></div> : null}
      {activeTab === 'sales' ? <SalesModule state={state} saleDraft={saleDraft} setSaleDraft={setSaleDraft} addSale={addSale} /> : null}
      {activeTab === 'payments' ? <PaymentsModule state={state} paymentDraft={paymentDraft} setPaymentDraft={setPaymentDraft} processPayment={processPayment} /> : null}
      {activeTab === 'invoices' ? <InvoiceModule state={state} invoiceDraft={invoiceDraft} setInvoiceDraft={setInvoiceDraft} addInvoice={addInvoice} /> : null}
      {activeTab === 'collections' ? <FinanceModule state={state} financeDraft={financeDraft} setFinanceDraft={setFinanceDraft} addFinanceTransaction={addFinanceTransaction} /> : null}
      {activeTab === 'reports' ? <DrawerSimple title="Finans raporlar?" rows={['MRR, ARR ve tahsilat trendleri bu sekmede odaklan?r.', 'Detayl? raporlar ayr? y?zeylerde tutulur.']} /> : null}
    </div>
  );
}

function DeviceCenter({ liveOps }: { liveOps: LiveOperationsPayload | null }) {
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Aktif cihaz" value={String(liveOps?.summary.activeDevices ?? 0)} />
        <Metric label="Online branch" value={String(liveOps?.summary.onlineBranches ?? 0)} />
        <Metric label="Online user" value={String(liveOps?.summary.onlineUsers ?? 0)} />
      </div>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Cihaz sağlığı</h3>
        <div className="mt-4 grid gap-3">
          {(liveOps?.devices ?? []).slice(0, 24).map((device) => (
            <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.035] p-4">
              <div><p className="font-semibold">{device.deviceId}</p><p className="text-xs text-slate-400">{device.tenantId} / {device.deviceType}</p></div>
              <div className="flex items-center gap-3"><StatusPill status={device.status} /><span className="text-sm text-slate-300">{device.latencyMs ?? '-'} ms</span></div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function SecurityCenter({ liveOps }: { liveOps: LiveOperationsPayload | null }) {
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Failed login / 24s" value={String(liveOps?.summary.failedLogins24h ?? 0)} />
        <Metric label="Online tenant" value={String(liveOps?.summary.onlineTenants ?? 0)} />
        <Metric label="Aktif session" value={String(liveOps?.summary.onlineUsers ?? 0)} />
      </div>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Security timeline</h3>
        <div className="mt-4 grid gap-3">
          {(liveOps?.events ?? []).filter((event) => event.type.startsWith('auth.')).slice(0, 16).map((event) => (
            <div key={event.id} className="rounded-2xl bg-white/[0.035] p-4">
              <p className="font-semibold">{event.message}</p>
              <p className="mt-1 text-xs text-slate-400">{event.type} / {event.tenantId ?? 'global'} / {new Date(event.createdAt).toLocaleString('tr-TR')}</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function AiInsightsCenter({ state, saasTenants, liveOps }: { state: SystemAdminState; saasTenants: SaasTenantRow[]; liveOps: LiveOperationsPayload | null }) {
  const expired = saasTenants.filter((tenant) => tenant.status !== 'active').slice(0, 4);
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Churn risk" value={String(expired.length)} />
        <Metric label="Upgrade fırsatı" value={String(state.tenants.filter((tenant) => tenant.package_type === 'mini').length)} />
        <Metric label="Operasyon alarmı" value={String(liveOps?.summary.failedLogins24h ?? 0)} />
      </div>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">AI öneri kuyruğu</h3>
        <div className="mt-4 grid gap-3">
          {expired.map((tenant) => (
            <div key={tenant.tenantId} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="font-semibold">{tenant.companyName}</p>
              <p className="mt-1 text-sm text-slate-300">Abonelik veya operasyon riski mevcut. Yenileme ve sağlık kontrolü önerilir.</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function BillingCenter(props: any) {
  return <PackagesModule {...props} />;
}

function ResellerCenter(props: any) {
  return <DealersModule {...props} />;
}

function TenantOperationsDrawer({ tenantId, tenant, liveOps, provisioningJobs, state, onRefresh, onClose }: { tenantId: string; tenant: SaasTenantRow | null; liveOps: LiveOperationsPayload | null; provisioningJobs: ProvisioningJobRow[]; state: SystemAdminState; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TenantDrawerTab>('profile');
  const [managementMessage, setManagementMessage] = useState('');
  const [managementLoading, setManagementLoading] = useState(false);
  const presence = liveOps?.presence.filter((row) => row.tenantId === tenantId) ?? [];
  const devices = liveOps?.devices.filter((row) => row.tenantId === tenantId) ?? [];
  const events = liveOps?.events.filter((row) => row.tenantId === tenantId) ?? [];
  const jobs = provisioningJobs.filter((job) => job.targetTenantId === tenantId);
  const tenantState = state.tenants.find((row) => row.tenant_id === tenantId);
  const tabs: Array<{ id: TenantDrawerTab; label: string }> = [
    { id: 'profile', label: 'Genel Bilgiler' },
    { id: 'subscription', label: 'Abonelik' },
    { id: 'password', label: 'Kullanıcı & Şifre' },
    { id: 'license', label: 'Durum' },
    { id: 'data', label: 'Veri Özeti' },
    { id: 'export', label: 'Dışa Aktar' },
    { id: 'danger', label: 'Tehlikeli İşlemler' },
  ];
  const health = tenant?.deletedAt ? 0 : tenant?.status === 'active' ? 92 : tenant?.status === 'trial' ? 81 : 54;
  useEffect(() => {
    const next = new URL(window.location.href);
    next.searchParams.set('tenant', tenantId);
    window.history.replaceState(null, '', next);
    return () => {
      const cleanup = new URL(window.location.href);
      cleanup.searchParams.delete('tenant');
      window.history.replaceState(null, '', cleanup);
    };
  }, [tenantId]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/45" role="dialog" aria-modal="true">
      <button type="button" aria-label="Kapat" onClick={onClose} className="flex-1" />
      <aside className="flex h-full w-full max-w-5xl flex-col border-l border-white/10 bg-[#0b1322] shadow-2xl">
        <header className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-xl font-semibold text-cyan-100">{tenant?.companyName?.slice(0, 2).toUpperCase() ?? 'TN'}</div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold">{tenant?.companyName ?? tenantId}</h2>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" />
                </div>
                <p className="mt-1 text-sm text-slate-400">{tenantId} / {tenantStatusLabel(tenant?.status)} / sağlık {health}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2"><StatusPill status={tenant?.status ?? 'unknown'} /><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Kapat</button></div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ${activeTab === tab.id ? 'bg-cyan-400/15 text-cyan-100' : 'bg-white/5 text-slate-300'}`}>{tab.label}</button>)}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <DrawerTenantManagement activeTab={activeTab} tenantId={tenantId} tenant={tenant} presence={presence} devices={devices} events={events} state={state} loading={managementLoading} message={managementMessage} onAction={async (body) => {
            if (managementLoading) return;
            setManagementLoading(true);
            setManagementMessage('');
            const context = { tenantId, action: body.action, timestamp: new Date().toISOString() };
            try {
              const response = await fetch('/api/system-admin/tenants', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ tenantId, ...body }),
              });
              const payload = await response.json().catch(() => null) as { error?: string } | null;
              if (!response.ok) {
                console.error('[system-admin] tenant management action failed', { ...context, status: response.status, error: payload?.error });
                setManagementMessage(payload?.error ?? 'İşlem başarısız.');
                return;
              }
              setManagementMessage(body.action === 'soft_delete_tenant' ? 'Abone silindi. Veriler korunuyor.' : 'İşlem başarılı.');
              await onRefresh();
              if (body.action === 'soft_delete_tenant') onClose();
            } catch (error) {
              console.error('[system-admin] tenant management action failed', { ...context, error: error instanceof Error ? error.message : String(error) });
              setManagementMessage('İşlem başarısız.');
            } finally {
              setManagementLoading(false);
            }
          }} />
        </div>
      </aside>
    </div>
  );
}

function DrawerOverview({ tenant, tenantState, presence, devices, jobs, events }: { tenant: SaasTenantRow | null; tenantState?: AdminTenant; presence: LivePresenceRow[]; devices: LiveDeviceRow[]; jobs: ProvisioningJobRow[]; events: LiveEventRow[] }) {
  const remaining = daysRemaining(tenant?.expiresAt);
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    <Metric label="Bugün ciro" value={formatAdminMoney(tenant?.dailyRevenue ?? 0)} />
    <Metric label="Aktif kullanıcı" value={String(presence.length)} />
    <Metric label="Aktif cihaz" value={String(devices.length)} />
    <Metric label="Aktif şube" value={String(tenant?.activeBranchCount ?? 0)} />
    <Metric label="Failed ops" value={String(events.filter((event) => event.severity === 'error' || event.severity === 'critical').length)} />
    <Metric label="Onboarding jobs" value={String(jobs.length)} />
    <Metric label="Products" value={String(tenant?.productCount ?? 0)} />
    <Metric label="Stock" value={String(tenant?.stockCount ?? 0)} />
    <Metric label="Cari" value={String(tenant?.currentAccountCount ?? 0)} />
    <Metric label="Tables" value={String(tenant?.tableCount ?? 0)} />
    <Metric label="Orders" value={String(tenant?.orderCount ?? 0)} />
    <Metric label="Sales" value={formatAdminMoney(tenant?.salesTotal ?? 0)} />
    <Metric label="Reports" value={String(tenant?.reportCount ?? 0)} />
    <Metric label="Printers" value={String(tenant?.printerCount ?? 0)} />
    <Metric label="Runtime snapshots" value={String(tenant?.runtimeSnapshotCount ?? 0)} />
    <Metric label="Son giriş" value={formatDate(tenant?.lastLogin)} />
    <Metric label="DB footprint" value={String(tenant?.databaseFootprint ?? 0)} />
    <div className="md:col-span-2 xl:col-span-3"><DrawerSimple title="Abonelik Özeti" rows={[
      `Tenant status: ${tenant?.status ?? '-'}`,
      `Subscription status: ${tenant?.subscriptionStatus ?? '-'}`,
      `Başlangıç: ${formatDate(tenant?.startsAt)}`,
      `Bitiş: ${formatDate(tenant?.expiresAt)}`,
      `Kalan gün: ${tenant?.unlimitedLicense ? 'limitsiz' : remaining ?? '-'}`,
      `Limitsiz lisans: ${tenant?.unlimitedLicense ? 'evet' : 'hayır'}`,
      `Son güncelleme: ${formatDate(tenant?.subscriptionUpdatedAt)}`,
      `Admin e-posta: ${tenant?.adminEmail ?? '-'}`,
      `Admin kullanıcı: ${tenant?.adminUsername ?? 'admin'}`,
      `Tenant kodu: ${tenant?.tenantId ?? '-'}`,
      `Erişim politikası: ${subscriptionAccessLabel(tenant)}`,
      `Yenileme notu: ${tenantState ? createRenewalNotice(tenantState) : '-'}`,
    ]} /></div>
  </div>;
}
function DrawerTenantManagement({ activeTab, tenantId, tenant, presence, devices, events, state, loading, message, onAction }: { activeTab: TenantDrawerTab; tenantId: string; tenant: SaasTenantRow | null; presence: LivePresenceRow[]; devices: LiveDeviceRow[]; events: LiveEventRow[]; state: SystemAdminState; loading: boolean; message: string; onAction: (body: Record<string, unknown>) => Promise<void> }) {
  const [manualEndsAt, setManualEndsAt] = useState(tenant?.expiresAt?.slice(0, 10) ?? '');
  const [tempPassword, setTempPassword] = useState('');
  const [oneTimePassword, setOneTimePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [profileDraft, setProfileDraft] = useState({
    companyName: tenant?.companyName ?? '',
    legalName: tenant?.legalName ?? '',
    taxNumber: tenant?.taxNumber ?? '',
    phone: tenant?.phone ?? '',
    email: tenant?.email ?? tenant?.adminEmail ?? '',
    contactName: tenant?.contactName ?? '',
    address: tenant?.address ?? '',
    notes: tenant?.notes ?? '',
  });
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    setManualEndsAt(tenant?.expiresAt?.slice(0, 10) ?? '');
    setDeleteConfirmation('');
    setTempPassword('');
    setOneTimePassword('');
    setProfileDraft({
      companyName: tenant?.companyName ?? '',
      legalName: tenant?.legalName ?? '',
      taxNumber: tenant?.taxNumber ?? '',
      phone: tenant?.phone ?? '',
      email: tenant?.email ?? tenant?.adminEmail ?? '',
      contactName: tenant?.contactName ?? '',
      address: tenant?.address ?? '',
      notes: tenant?.notes ?? '',
    });
  }, [tenant?.expiresAt, tenantId, tenant?.companyName, tenant?.legalName, tenant?.taxNumber, tenant?.phone, tenant?.email, tenant?.contactName, tenant?.address, tenant?.notes, tenant?.adminEmail]);
  async function submitAction(body: Record<string, unknown>) {
    setLocalError('');
    await onAction(body);
  }
  async function applyManualDate() {
    if (!manualEndsAt || Number.isNaN(new Date(manualEndsAt).getTime())) {
      setLocalError('Geçerli bir bitiş tarihi seçin.');
      return;
    }
    await submitAction({ action: 'update_subscription', endsAt: manualEndsAt, unlimitedLicense: false });
  }
  async function createTemporaryPassword() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const generated = `${tenantId}-${randomPart}!`;
    setOneTimePassword(generated);
    await submitAction({ action: 'update_password', username: 'admin', temporaryPassword: generated, forcePasswordChange: true });
  }
  const activityHint = `${presence.length} aktif kullanıcı / ${devices.length} cihaz / ${events.length} olay / ${state.tenants.length} tenant`;
  const summaryRows = [
    ['Abone Kodu', tenant?.tenantId ?? tenantId],
    ['Firma Adı', tenant?.companyName ?? '-'],
    ['Durum', tenant?.deletedAt ? 'Silinmiş' : tenantStatusLabel(tenant?.status)],
    ['Abonelik Durumu', tenant?.subscriptionStatus ?? '-'],
    ['Bitiş Tarihi', formatDate(tenant?.expiresAt)],
    ['Kalan Gün', tenant?.unlimitedLicense ? 'limitsiz' : String(daysRemaining(tenant?.expiresAt) ?? '-')],
    ['Limitsiz Lisans', tenant?.unlimitedLicense ? 'Evet' : 'Hayır'],
    ['Son Giriş', formatDate(tenant?.lastLogin)],
  ];
  return <div className="grid gap-5">
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
      <div className="grid gap-3 md:grid-cols-4">{summaryRows.map(([label, value]) => <MiniMetric key={label} label={label} value={value} />)}</div>
      <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">{activityHint}</p>
      {message ? <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">{message}</p> : null}
      {localError ? <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{localError}</p> : null}
    </article>

    {activeTab === 'profile' ? <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">Genel Bilgiler</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={profileDraft.companyName} onChange={(e) => setProfileDraft((c) => ({ ...c, companyName: e.target.value }))} placeholder="Firma Adı" className="input-dark" />
        <input value={tenantId} disabled className="input-dark opacity-70" aria-label="Abone Kodu" />
        <input value={profileDraft.taxNumber} onChange={(e) => setProfileDraft((c) => ({ ...c, taxNumber: e.target.value }))} placeholder="Vergi No" className="input-dark" />
        <input value={profileDraft.phone} onChange={(e) => setProfileDraft((c) => ({ ...c, phone: e.target.value }))} placeholder="Telefon" className="input-dark" />
        <input value={profileDraft.email} onChange={(e) => setProfileDraft((c) => ({ ...c, email: e.target.value }))} placeholder="Admin E-posta" className="input-dark" />
        <input value={profileDraft.contactName} onChange={(e) => setProfileDraft((c) => ({ ...c, contactName: e.target.value }))} placeholder="Yetkili Kişi" className="input-dark" />
        <input value={profileDraft.legalName} onChange={(e) => setProfileDraft((c) => ({ ...c, legalName: e.target.value }))} placeholder="Ticari Ünvan" className="input-dark" />
        <input value={profileDraft.address} onChange={(e) => setProfileDraft((c) => ({ ...c, address: e.target.value }))} placeholder="Adres" className="input-dark" />
        <textarea value={profileDraft.notes} onChange={(e) => setProfileDraft((c) => ({ ...c, notes: e.target.value }))} placeholder="Notlar" className="input-dark min-h-24 py-3 md:col-span-2" />
      </div>
      <button disabled={loading} type="button" onClick={() => submitAction({ action: 'update_tenant_info', ...profileDraft })} className="btn-blue mt-4">Bilgileri Kaydet</button>
    </article> : null}

    {activeTab === 'subscription' ? <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">Abonelik</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniMetric label="Başlangıç Tarihi" value={formatDate(tenant?.startsAt)} />
        <MiniMetric label="Bitiş Tarihi" value={formatDate(tenant?.expiresAt)} />
        <MiniMetric label="Son Güncelleme" value={formatDate(tenant?.subscriptionUpdatedAt)} />
      </div>
      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input type="date" value={manualEndsAt} onChange={(event) => setManualEndsAt(event.target.value)} className="input-dark" />
          <button disabled={loading || !manualEndsAt} type="button" onClick={() => void applyManualDate()} className="btn-blue">Kullanım Tarihini Değiştir</button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <button disabled={loading} type="button" onClick={() => submitAction({ action: 'update_subscription', addDays: 30, unlimitedLicense: false })} className="btn-blue">+30 Gün Ekle</button>
          <button disabled={loading} type="button" onClick={() => submitAction({ action: 'update_subscription', addMonths: 1, unlimitedLicense: false })} className="btn-blue">+1 Ay Ekle</button>
          <button disabled={loading} type="button" onClick={() => submitAction({ action: 'update_subscription', addYears: 1, unlimitedLicense: false })} className="btn-blue">+1 Yıl Ekle</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={loading || tenant?.unlimitedLicense === true} type="button" onClick={() => submitAction({ action: 'update_subscription', unlimitedLicense: true })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-60">Limitsiz Lisans Yap</button>
          <button disabled={loading || tenant?.unlimitedLicense !== true} type="button" onClick={() => submitAction({ action: 'update_subscription', unlimitedLicense: false, subscriptionStatus: 'active' })} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold disabled:opacity-60">Limitsiz Lisansı Kaldır</button>
        </div>
      </div>
    </article> : null}

    {activeTab === 'password' ? <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">Kullanıcı & Şifre</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MiniMetric label="Admin Kullanıcı" value={tenant?.adminUsername ?? 'admin'} />
        <MiniMetric label="Admin E-posta" value={tenant?.adminEmail ?? '-'} />
        <MiniMetric label="Son Giriş" value={formatDate(tenant?.lastLogin)} />
        <MiniMetric label="Kullanıcı Aktif mi?" value={tenant?.adminActive ? 'Evet' : 'Hayır'} />
        <MiniMetric label="Şifre Değişimi Zorunlu mu?" value={tenant?.adminPasswordResetRequired ? 'Evet' : 'Hayır'} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
        <input type="text" value={tempPassword} onChange={(event) => setTempPassword(event.target.value)} placeholder={`${tenantId}-geçici-şifre`} className="input-dark" />
        <button disabled={loading || !tempPassword.trim()} type="button" onClick={() => submitAction({ action: 'update_password', username: 'admin', temporaryPassword: tempPassword.trim(), forcePasswordChange: false })} className="btn-blue">Admin Şifresini Sıfırla</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={loading} type="button" onClick={() => void createTemporaryPassword()} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">Geçici Şifre Oluştur</button>
        <button disabled={loading} type="button" onClick={() => submitAction({ action: 'update_password', username: 'admin', forcePasswordChange: true })} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">Sonraki Girişte Şifre Değiştir</button>
        <button disabled={loading || tenant?.adminActive === false} type="button" onClick={() => submitAction({ action: 'update_user_status', username: 'admin', active: false })} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">Kullanıcıyı Kilitle</button>
        <button disabled={loading || tenant?.adminActive === true} type="button" onClick={() => submitAction({ action: 'update_user_status', username: 'admin', active: true })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">Kullanıcı Kilidini Aç</button>
      </div>
      {oneTimePassword ? <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Geçici şifre sadece bir kez gösterilir: <code className="font-semibold">{oneTimePassword}</code></p> : null}
    </article> : null}

    {activeTab === 'license' ? <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">Durum</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniMetric label="Mevcut Durum" value={tenant?.deletedAt ? 'Silinmiş' : tenantStatusLabel(tenant?.status)} />
        <MiniMetric label="Erişim Politikası" value={subscriptionAccessLabel(tenant)} />
        <MiniMetric label="Limitsiz Lisans" value={tenant?.unlimitedLicense ? 'Evet' : 'Hayır'} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <button disabled={loading || Boolean(tenant?.deletedAt)} type="button" onClick={() => submitAction({ action: 'update_status', tenantStatus: 'active' })} className="btn-blue">Aktif Yap</button>
        <button disabled={loading || Boolean(tenant?.deletedAt)} type="button" onClick={() => submitAction({ action: 'update_status', tenantStatus: 'suspended' })} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">Askıya Al</button>
        <button disabled={loading || Boolean(tenant?.deletedAt)} type="button" onClick={() => submitAction({ action: 'update_status', tenantStatus: 'expired' })} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">Süresi Doldu Yap</button>
        <button disabled={loading || Boolean(tenant?.deletedAt)} type="button" onClick={() => submitAction({ action: 'update_status', tenantStatus: 'blocked' })} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">Devre Dışı Bırak</button>
        <button disabled={loading || !tenant?.deletedAt} type="button" onClick={() => submitAction({ action: 'restore_tenant', tenantStatus: 'suspended' })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-50">Silinmişten Geri Al</button>
      </div>
    </article> : null}

    {activeTab === 'data' ? <TenantDataSummary tenant={tenant} /> : null}
    {activeTab === 'export' ? <TenantExportPanel tenantId={tenantId} loading={loading} /> : null}
    {activeTab === 'danger' ? <article className="rounded-[1.35rem] border border-rose-400/30 bg-rose-950/30 p-5">
      <h3 className="text-lg font-semibold text-rose-100">Tehlikeli İşlemler</h3>
      {tenant?.deletedAt ? <div className="mt-4 grid gap-3">
        <p className="text-sm text-slate-300">Bu abone pasif listede. Geri alma işlemi verileri silmez veya demo veri oluşturmaz.</p>
        <button disabled={loading} type="button" onClick={() => submitAction({ action: 'restore_tenant', tenantStatus: 'suspended' })} className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">Aboneyi Geri Al</button>
      </div> : <div className="mt-4 grid gap-3">
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Bu işlem aboneyi pasife alır ve erişimini kapatır. Veriler korunur. Devam etmek için abone kodunu yazın.</p>
        <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={tenantId} className="input-dark" />
        <button disabled={loading || deleteConfirmation.trim().toUpperCase() !== tenantId.toUpperCase()} type="button" onClick={() => submitAction({ action: 'soft_delete_tenant', confirmationTenantId: deleteConfirmation.trim() })} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Aboneyi Sil</button>
        <button disabled className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-400">Kalıcı Silme Talebi Oluştur</button>
      </div>}
    </article> : null}
  </div>;
}

function TenantDataSummary({ tenant }: { tenant: SaasTenantRow | null }) {
  const warningBadges = [
    tenant && (tenant.productCount ?? 0) === 0 ? 'veri yok' : null,
    tenant && (tenant.salesTotal ?? 0) === 0 ? 'satış yok' : null,
    tenant && (tenant.status === 'expired' || tenant.subscriptionStatus === 'expired') ? 'süresi dolmuş' : null,
    tenant && (tenant.runtimeSnapshotCount ?? 0) > 250 ? 'yüksek snapshot' : null,
    tenant && (tenant.printerCount ?? 0) === 0 ? 'yazıcı tanımsız' : null,
  ].filter(Boolean) as string[];
  const rows: Array<[string, string]> = [
    ['Ürün Sayısı', String(tenant?.productCount ?? 0)],
    ['Kategori Sayısı', String(tenant?.categoryCount ?? 0)],
    ['Hammadde Sayısı', String(tenant?.stockCount ?? 0)],
    ['Reçete Sayısı', String(tenant?.recipeCount ?? 0)],
    ['Stok Kaydı', String(tenant?.stockCount ?? 0)],
    ['Cari Hesap Sayısı', String(tenant?.currentAccountCount ?? 0)],
    ['Kasa Hareketi Sayısı', String(tenant?.cashRecordCount ?? 0)],
    ['Sipariş Sayısı', String(tenant?.orderCount ?? 0)],
    ['Ödeme Sayısı', String(tenant?.paymentCount ?? 0)],
    ['Günlük Rapor Sayısı', String(tenant?.reportCount ?? 0)],
    ['Yazıcı Eşleşmesi', String(tenant?.printerCount ?? 0)],
    ['Runtime Snapshot Sayısı', String(tenant?.runtimeSnapshotCount ?? 0)],
    ['Toplam Satış', formatAdminMoney(tenant?.salesTotal ?? 0)],
    ['Son Sipariş Tarihi', formatDate(tenant?.lastOrderAt)],
    ['Son Giriş Tarihi', formatDate(tenant?.lastLogin)],
  ];
  return <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Veri Özeti / Tenant Health</h3>
      <div className="flex flex-wrap gap-2">{warningBadges.map((badge) => <span key={badge} className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">{badge}</span>)}</div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">{rows.map(([label, value]) => <MiniMetric key={label} label={label} value={value} />)}</div>
  </article>;
}

function TenantExportPanel({ tenantId, loading }: { tenantId: string; loading: boolean }) {
  const exportUrl = `/api/system-admin/tenants?exportTenantId=${encodeURIComponent(tenantId)}`;
  const openExport = () => window.open(exportUrl, '_blank', 'noopener,noreferrer');
  return <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
    <h3 className="text-lg font-semibold">Dışa Aktar</h3>
    <div className="mt-4 grid gap-2 md:grid-cols-3">
      {['Ürünleri Dışa Aktar', 'Cari Hesapları Dışa Aktar', 'Stokları Dışa Aktar', 'Reçeteleri Dışa Aktar', 'Tüm Abone Verisini JSON Dışa Aktar'].map((label) => (
        <button key={label} disabled={loading} type="button" onClick={openExport} className="btn-blue">{label}</button>
      ))}
    </div>
  </article>;
}
function DrawerLiveOps({ presence, events }: { presence: LivePresenceRow[]; events: LiveEventRow[] }) { return <div className="grid gap-5"><DrawerSimple title="Aktif kullanıcılar" rows={presence.map((row) => `${row.username} / ${row.role} / ${row.currentRoute ?? '-'}`)} /><DrawerActivity events={events} /></div>; }
function DrawerFinance({ tenantId, state }: { tenantId: string; state: SystemAdminState }) { return <DrawerSimple title="Finance" rows={state.payments.filter((p) => p.tenant_id === tenantId).map((p) => `${p.date} / ${formatAdminMoney(p.amount)} / ${p.status}`)} />; }
function DrawerDevices({ devices, title }: { devices: LiveDeviceRow[]; title: string }) { return <DrawerSimple title={title} rows={devices.map((device) => `${device.deviceId} / ${device.status} / ${device.latencyMs ?? '-'} ms`)} />; }
function DrawerQueues({ jobs }: { jobs: ProvisioningJobRow[] }) { return <DrawerSimple title="Queues" rows={jobs.map((job) => `${job.id.slice(0, 8)} / ${job.status} / ${job.currentStep}`)} />; }
function DrawerAudit({ events }: { events: LiveEventRow[] }) { return <DrawerSimple title="Audit Logs" rows={events.map((event) => `${event.type} / ${event.message}`)} />; }
function DrawerActivity({ events }: { events: LiveEventRow[] }) { return <DrawerSimple title="Activity Stream" rows={events.map((event) => `${new Date(event.createdAt).toLocaleTimeString('tr-TR')} / ${event.message}`)} />; }
function DrawerAi({ tenant, events }: { tenant: SaasTenantRow | null; events: LiveEventRow[] }) { return <DrawerSimple title="AI Insights" rows={[`Churn risk: ${tenant?.status === 'active' ? 'low' : 'elevated'}`, `Evidence: ${events.length} recent operational events`, `Upgrade opportunity: ${tenant?.plan === 'mini' ? 'present' : 'watch'}`]} />; }
function DrawerSimple({ title, rows }: { title: string; rows: string[] }) { return <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5"><h3 className="text-lg font-semibold">{title}</h3><div className="mt-4 grid gap-2">{rows.length ? rows.map((row, index) => <p key={`${title}-${index}`} className="rounded-xl bg-white/[0.035] px-3 py-2 text-sm text-slate-300">{row}</p>) : <p className="text-sm text-slate-400">Kayıt yok.</p>}</div></article>; }

function CommandPalette({ tenants, onClose, onSelectTenant }: { tenants: SaasTenantRow[]; onClose: () => void; onSelectTenant: (tenantId: string) => void }) {
  const [query, setQuery] = useState('');
  const visible = tenants.filter((tenant) => `${tenant.companyName} ${tenant.tenantId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-6 pt-24">
    <button type="button" aria-label="Kapat" className="absolute inset-0" onClick={onClose} />
    <div className="relative w-full max-w-2xl rounded-[1.5rem] border border-white/10 bg-[#0d1626] p-4 shadow-2xl">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4">
        <Search className="h-4 w-4 text-slate-400" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tenant, cihaz, kuyruk ara..." className="h-12 flex-1 bg-transparent text-sm outline-none" />
      </div>
      <div className="mt-3 grid gap-2">{visible.map((tenant) => <button key={tenant.tenantId} type="button" onClick={() => onSelectTenant(tenant.tenantId)} className="rounded-2xl px-4 py-3 text-left hover:bg-white/5"><p className="font-semibold">{tenant.companyName}</p><p className="text-xs text-slate-400">{tenant.tenantId}</p></button>)}</div>
    </div>
  </div>;
}

function IncidentCenter({ incidents, summary, refresh, onOpenTenant }: { incidents: IncidentRow[]; summary: IncidentSummary | null; refresh: () => Promise<void>; onOpenTenant: (tenantId: string) => void }) {
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'critical' | 'history' | 'root' | 'escalation' | 'resolved'>('active');
  const visibleIncidents = incidents.filter((incident) => {
    if (activeTab === 'critical') return incident.severity === 'critical' || incident.severity === 'outage';
    if (activeTab === 'resolved') return incident.status === 'resolved';
    if (activeTab === 'active') return incident.status !== 'resolved';
    return true;
  });
  const selected = visibleIncidents.find((incident) => incident.id === selectedIncidentId) ?? visibleIncidents[0];
  async function act(action: 'acknowledge' | 'resolve', incidentId: string) {
    await fetch('/api/system-admin/incidents/actions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, incidentId }),
    });
    await refresh();
  }
  return <section className="grid gap-5">
    <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Toplam incident" value={String(summary?.total ?? 0)} />
      <Metric label="Açık" value={String(summary?.open ?? 0)} />
      <Metric label="Kritik" value={String(summary?.critical ?? 0)} />
      <Metric label="Outage" value={String(summary?.outage ?? 0)} />
    </div>
    <DomainTabs value={activeTab} onChange={setActiveTab} tabs={[
      ['active', 'Aktif Olaylar'],
      ['critical', 'Kritik Olaylar'],
      ['history', 'Geçmiş'],
      ['root', 'Root Cause'],
      ['escalation', 'Eskalasyon'],
      ['resolved', 'Çözülmüş Olaylar'],
    ]} />
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
      <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Incident Center</h3>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Yenile</button>
        </div>
        <div className="mt-4 grid gap-2">
          {visibleIncidents.map((incident) => <button key={incident.id} type="button" onClick={() => setSelectedIncidentId(incident.id)} className={`rounded-2xl border p-4 text-left ${selected?.id === incident.id ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025]'}`}>
            <div className="flex items-center justify-between gap-3"><p className="font-semibold">{incident.title}</p><StatusPill status={incident.severity} /></div>
            <p className="mt-2 text-sm text-slate-400">{incident.tenantId ?? 'platform'} / {incident.status}</p>
          </button>)}
          {!visibleIncidents.length ? <p className="text-sm text-slate-400">Bu g?r?n?mde olay yok.</p> : null}
        </div>
      </article>
      <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
        {selected ? <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{selected.type}</p>
              <h3 className="mt-1 text-xl font-semibold">{selected.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{selected.summary}</p>
            </div>
            <div className="flex gap-2">
              {selected.tenantId ? <button type="button" onClick={() => onOpenTenant(selected.tenantId!)} className="rounded-xl border border-white/10 px-3 py-2 text-xs">Tenant a?</button> : null}
              {selected.status === 'open' ? <button type="button" onClick={() => void act('acknowledge', selected.id)} className="rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100">Onayla</button> : null}
              {selected.status !== 'resolved' ? <button type="button" onClick={() => void act('resolve', selected.id)} className="rounded-xl bg-emerald-400/15 px-3 py-2 text-xs text-emerald-100">Çöz</button> : null}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <MiniMetric label="Tenant" value={selected.tenantId ?? 'platform'} />
            <MiniMetric label="Correlation" value={selected.correlationId ?? '-'} />
            <MiniMetric label="Açılış" value={new Date(selected.openedAt).toLocaleString('tr-TR')} />
          </div>
          <div className="mt-5">
            <h4 className="font-semibold">Root timeline</h4>
            <div className="mt-3 grid gap-2">
              {(selected.events ?? []).map((event) => <div key={event.id} className="rounded-2xl bg-white/[0.035] px-4 py-3">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{event.eventType}</p><span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleTimeString('tr-TR')}</span></div>
                <p className="mt-1 text-sm text-slate-300">{event.message}</p>
              </div>)}
            </div>
          </div>
        </> : <p className="text-sm text-slate-400">İncelemek için incident seçin.</p>}
      </article>
    </div>
  </section>;
}

function AuditExplorer() {
  const [query, setQuery] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [rows, setRows] = useState<DurableAuditRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  async function search() {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tenantId) params.set('tenantId', tenantId);
    const response = await fetch(`/api/system-admin/audit?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null) as { rows?: DurableAuditRow[] } | null;
    setRows(payload?.rows ?? []);
  }
  useEffect(() => { void search(); }, []);
  return <section className="grid gap-5">
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Aksiyon, actor, device, entity ara..." className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm outline-none" />
        <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Tenant filter" className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm outline-none" />
        <button type="button" onClick={() => void search()} className="rounded-xl bg-cyan-400/15 px-4 text-sm font-semibold text-cyan-100">Ara</button>
      </div>
    </article>
    <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
      <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-4">
        <div className="grid gap-2">
          {rows.map((row) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`rounded-2xl border p-4 text-left ${selected?.id === row.id ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025]'}`}>
            <p className="font-mono text-sm">{row.action}</p>
            <p className="mt-2 text-xs text-slate-400">{row.tenantId ?? '-'} / {row.entity ?? '-'} / {new Date(row.createdAt).toLocaleString('tr-TR')}</p>
          </button>)}
        </div>
      </article>
      <article className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5">
        {selected ? <>
          <h3 className="text-lg font-semibold">{selected.action}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MiniMetric label="Actor" value={selected.userId ?? '-'} />
            <MiniMetric label="Device" value={selected.deviceId ?? '-'} />
            <MiniMetric label="Correlation" value={selected.correlationId ?? '-'} />
            <MiniMetric label="Mutation" value={selected.mutationId ?? '-'} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <AuditJson title="Before" value={selected.before} />
            <AuditJson title="After" value={selected.after} />
          </div>
        </> : <p className="text-sm text-slate-400">Audit kaydı seçin.</p>}
      </article>
    </div>
  </section>;
}

function AuditJson({ title, value }: { title: string; value: unknown }) {
  return <div className="rounded-2xl bg-black/25 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(value ?? {}, null, 2)}</pre>
  </div>;
}

function LiveOperationsModule() {
  const [data, setData] = useState<LiveOperationsPayload | null>(null);
  const [history, setHistory] = useState<HistoricalMetricRow[]>([]);
  const [error, setError] = useState('');

  async function refresh() {
    const response = await fetch('/api/system-admin/live-operations', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as LiveOperationsPayload | null : null;
    if (!response?.ok || !payload) {
      setError('Canlı operasyon verisi alınamadı.');
      return;
    }
    setData(payload);
    setError('');
  }

  async function refreshHistory() {
    const response = await fetch('/api/system-admin/live-operations/history?days=7', { credentials: 'include', cache: 'no-store' }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) as { metrics?: HistoricalMetricRow[] } | null : null;
    if (payload?.metrics) setHistory(payload.metrics);
  }

  useEffect(() => {
    void refresh();
    void refreshHistory();
    const stream = new EventSource('/api/system-admin/live-operations/stream', { withCredentials: true });
    stream.addEventListener('live-operations', (event) => {
      setData(JSON.parse((event as MessageEvent).data) as LiveOperationsPayload);
      setError('');
    });
    stream.addEventListener('error', () => {
      setError('Canlı operasyon stream bağlantısı kesildi; veri son görülen snapshot üzerinden gösteriliyor.');
    });
    return () => stream.close();
  }, []);

  const summary = data?.summary;
  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Realtime SaaS Operations</p>
          <h2 className="mt-2 text-2xl font-semibold">Canlı Operasyon Merkezi</h2>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded-xl bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/35">Yenile</button>
      </div>
      {error ? <p className="rounded-2xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Online tenant" value={String(summary?.onlineTenants ?? 0)} />
        <Metric label="Online kullanıcı" value={String(summary?.onlineUsers ?? 0)} />
        <Metric label="Aktif cihaz" value={String(summary?.activeDevices ?? 0)} />
        <Metric label="Aktif masa" value={String(summary?.activeTables ?? 0)} />
        <Metric label="Aktif sipariş" value={String(summary?.activeOrders ?? 0)} />
        <Metric label="Online şube" value={String(summary?.onlineBranches ?? 0)} />
        <Metric label="24s başarısız login" value={String(summary?.failedLogins24h ?? 0)} />
        <Metric label="Son snapshot" value={data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('tr-TR') : '-'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Presence</p>
          <h3 className="mt-2 text-xl font-semibold">Canlı oturumlar</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
                <tr><th className="pb-3">Tenant</th><th className="pb-3">Kullanıcı</th><th className="pb-3">Rol</th><th className="pb-3">Cihaz</th><th className="pb-3">Rota</th><th className="pb-3">Durum</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data?.presence ?? []).slice(0, 18).map((row) => (
                  <tr key={row.id}>
                    <td className="py-3">{row.tenantId}</td>
                    <td className="py-3">{row.username}</td>
                    <td className="py-3">{row.role}</td>
                    <td className="py-3">{[row.deviceType, row.browser, row.os].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="py-3 text-slate-300">{row.currentRoute ?? '-'}</td>
                    <td className="py-3"><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Event stream</p>
          <h3 className="mt-2 text-xl font-semibold">Son operasyonlar</h3>
          <div className="mt-4 grid gap-3">
            {(data?.events ?? []).slice(0, 12).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{event.message}</p>
                  <span className="text-[11px] text-slate-400">{new Date(event.createdAt).toLocaleTimeString('tr-TR')}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{event.type} / {event.tenantId ?? 'global'} / {event.source}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Device monitoring</p>
        <h3 className="mt-2 text-xl font-semibold">Aktif cihazlar</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr><th className="pb-3">Tenant</th><th className="pb-3">Cihaz</th><th className="pb-3">Tip</th><th className="pb-3">Durum</th><th className="pb-3">Latency</th><th className="pb-3">Failure</th><th className="pb-3">Son heartbeat</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(data?.devices ?? []).slice(0, 24).map((row) => (
                <tr key={row.id}>
                  <td className="py-3">{row.tenantId}</td>
                  <td className="py-3 font-mono text-xs">{row.deviceId}</td>
                  <td className="py-3">{row.deviceType}</td>
                  <td className="py-3"><StatusPill status={row.status} /></td>
                  <td className="py-3">{row.latencyMs ?? '-'} ms</td>
                  <td className="py-3">{row.failureCount}</td>
                  <td className="py-3 text-slate-300">{new Date(row.lastHeartbeatAt).toLocaleString('tr-TR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Cold telemetry</p>
            <h3 className="mt-2 text-xl font-semibold">7 günlük özet metrikler</h3>
          </div>
          <button type="button" onClick={() => void refreshHistory()} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">Ozetleri yenile</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <tr><th className="pb-3">Bucket</th><th className="pb-3">Tenant</th><th className="pb-3">Metrik</th><th className="pb-3">Adet</th><th className="pb-3">Ortalama</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {history.slice(0, 24).map((row) => (
                <tr key={row.id}>
                  <td className="py-3">{new Date(row.bucketStart).toLocaleString('tr-TR')} / {row.bucketSize}</td>
                  <td className="py-3">{row.tenantId}</td>
                  <td className="py-3">{row.metricType}</td>
                  <td className="py-3">{row.eventCount}</td>
                  <td className="py-3">{row.numericValue ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'online'
    ? 'bg-emerald-500/15 text-emerald-200'
    : status === 'idle'
      ? 'bg-amber-500/15 text-amber-200'
      : 'bg-slate-500/15 text-slate-300';
  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${color}`}>{status}</span>;
}

function TemplatesModule({ templates, packs, recipes, recipeItems, stocks, categories, packItems, importStats, reload }: {
  templates: TemplatePoolRow[];
  packs: TemplatePackRow[];
  recipes: RecipeTemplateRow[];
  recipeItems: RecipeTemplateItemRow[];
  stocks: StockTemplateRow[];
  categories: CategoryTemplateRow[];
  packItems: TemplatePackItemRow[];
  importStats: TemplateImportStat[];
  reload: () => Promise<void>;
}) {
  const importCountByTemplate = new Map(importStats.map((item) => [item.template?.id, item.importCount]));
  const [productDraft, setProductDraft] = useState({ id: '', key: '', name: '', restaurantType: 'Cafe', categoryTemplateId: '', defaultPrice: 0, vatRate: 10, unitType: 'adet', printerGroupName: '', preparationGroup: '', version: 1 });
  const [packDraft, setPackDraft] = useState({ id: '', key: '', name: '', restaurantType: 'Cafe', scale: 'small', version: 1, description: '', productTemplateIds: [] as string[] });
  const [categoryDraft, setCategoryDraft] = useState({ id: '', key: '', name: '', sortOrder: 0 });
  const [stockDraft, setStockDraft] = useState({ id: '', key: '', name: '', stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 0 });
  const [recipeDraft, setRecipeDraft] = useState({ id: '', productTemplateId: '', name: '', category: '', yieldQuantity: 1, unit: 'adet', items: [] as Array<{ stockTemplateId: string; name: string; quantity: number; unit: string }> });
  const [message, setMessage] = useState('');
  async function save(kind: string, payload: Record<string, unknown>) {
    const response = await fetch('/api/system-admin/templates', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, ...payload }) });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    setMessage(response.ok ? 'Kaydedildi.' : body?.error ?? 'Kaydetme başarısız.');
    if (response.ok) await reload();
  }

  async function removeProduct(id: string) {
    const response = await fetch(`/api/system-admin/templates?kind=product&id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    setMessage(response.ok ? 'Şablon silindi veya deprecated yapıldı.' : 'Silme başarısız.');
    if (response.ok) await reload();
  }
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Şablon sayısı" value={String(templates.length)} />
        <Metric label="Paket sayısı" value={String(packs.length)} />
        <Metric label="Restoran tipi" value={String(new Set(templates.map((template) => template.restaurantType)).size)} />
        <Metric label="Toplam import" value={String(importStats.reduce((sum, item) => sum + item.importCount, 0))} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Kategori</h3>
          <div className="mt-4 grid gap-3">
            <input value={categoryDraft.key} onChange={(e) => setCategoryDraft((c) => ({ ...c, key: e.target.value }))} placeholder="kategori anahtarı" className="input-dark" />
            <input value={categoryDraft.name} onChange={(e) => setCategoryDraft((c) => ({ ...c, name: e.target.value }))} placeholder="kategori adı" className="input-dark" />
          </div>
          <button type="button" onClick={() => void save('category', categoryDraft)} className="btn-blue">Kategoriyi kaydet</button>
        </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Ham madde</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={stockDraft.key} onChange={(e) => setStockDraft((c) => ({ ...c, key: e.target.value }))} placeholder="stok anahtarı" className="input-dark" />
            <input value={stockDraft.name} onChange={(e) => setStockDraft((c) => ({ ...c, name: e.target.value }))} placeholder="stok adı" className="input-dark" />
            <input value={stockDraft.stockUnit} onChange={(e) => setStockDraft((c) => ({ ...c, stockUnit: e.target.value }))} placeholder="stok birimi" className="input-dark" />
            <input value={stockDraft.recipeUnit} onChange={(e) => setStockDraft((c) => ({ ...c, recipeUnit: e.target.value }))} placeholder="reçete birimi" className="input-dark" />
          </div>
          <button type="button" onClick={() => void save('stock', stockDraft)} className="btn-blue">Ham maddeyi kaydet</button>
        </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Reçete</h3>
          <div className="mt-4 grid gap-3">
            <select value={recipeDraft.productTemplateId} onChange={(e) => setRecipeDraft((c) => ({ ...c, productTemplateId: e.target.value }))} className="input-dark"><option value="">Ürün seç</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
            <input value={recipeDraft.name} onChange={(e) => setRecipeDraft((c) => ({ ...c, name: e.target.value }))} placeholder="reçete adı" className="input-dark" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{stocks.map((stock) => <button key={stock.id} type="button" onClick={() => setRecipeDraft((c) => ({ ...c, items: [...c.items, { stockTemplateId: stock.id, name: stock.name, quantity: 1, unit: stock.recipeUnit }] }))} className="rounded-full bg-white/10 px-3 py-1 text-xs">{stock.name}</button>)}</div>
          <button type="button" onClick={() => void save('recipe', recipeDraft)} className="btn-blue">Reçeteyi kaydet</button>
        </article>
      </div>
      {message ? <p className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100">{message}</p> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Ürün şablonu</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={productDraft.key} onChange={(e) => setProductDraft((c) => ({ ...c, key: e.target.value }))} placeholder="anahtar" className="input-dark" />
            <input value={productDraft.name} onChange={(e) => setProductDraft((c) => ({ ...c, name: e.target.value }))} placeholder="ürün adı" className="input-dark" />
            <input value={productDraft.restaurantType} onChange={(e) => setProductDraft((c) => ({ ...c, restaurantType: e.target.value }))} placeholder="restoran tipi" className="input-dark" />
            <select value={productDraft.categoryTemplateId} onChange={(e) => setProductDraft((c) => ({ ...c, categoryTemplateId: e.target.value }))} className="input-dark"><option value="">Kategori yok</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <input type="number" value={productDraft.defaultPrice} onChange={(e) => setProductDraft((c) => ({ ...c, defaultPrice: Number(e.target.value) }))} placeholder="fiyat" className="input-dark" />
            <input value={productDraft.printerGroupName} onChange={(e) => setProductDraft((c) => ({ ...c, printerGroupName: e.target.value }))} placeholder="yazıcı grubu" className="input-dark" />
          </div>
          <button type="button" onClick={() => void save('product', productDraft)} className="btn-blue">Ürün şablonunu kaydet</button>
        </article>
        <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Paket oluşturucu</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={packDraft.key} onChange={(e) => setPackDraft((c) => ({ ...c, key: e.target.value }))} placeholder="paket anahtarı" className="input-dark" />
            <input value={packDraft.name} onChange={(e) => setPackDraft((c) => ({ ...c, name: e.target.value }))} placeholder="paket adı" className="input-dark" />
            <input value={packDraft.restaurantType} onChange={(e) => setPackDraft((c) => ({ ...c, restaurantType: e.target.value }))} placeholder="restoran tipi" className="input-dark" />
            <select value={packDraft.scale} onChange={(e) => setPackDraft((c) => ({ ...c, scale: e.target.value }))} className="input-dark"><option value="small">small</option><option value="medium">medium</option><option value="large">large</option></select>
          </div>
          <div className="mt-4 grid max-h-52 gap-2 overflow-auto rounded-2xl border border-white/10 p-3 sm:grid-cols-2">{templates.map((template) => <label key={template.id} className="flex gap-2 text-sm"><input type="checkbox" checked={packDraft.productTemplateIds.includes(template.id)} onChange={() => setPackDraft((c) => ({ ...c, productTemplateIds: c.productTemplateIds.includes(template.id) ? c.productTemplateIds.filter((id) => id !== template.id) : [...c.productTemplateIds, template.id] }))} />{template.name}</label>)}</div>
          <button type="button" onClick={() => void save('pack', packDraft)} className="btn-blue">Paketi kaydet</button>
        </article>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Reçete" value={String(recipes.length)} />
        <Metric label="Ham madde" value={String(stocks.length)} />
        <Metric label="Paket ataması" value={String(packItems.length)} />
        <Metric label="Reçete satırı" value={String(recipeItems.length)} />
      </div>
      <DataTable
        headers={['Paket', 'Tip', 'Ölçek', 'Versiyon', 'Durum']}
        rows={packs.map((pack) => [
          pack.name,
          pack.restaurantType,
          pack.scale,
          `v${pack.version}`,
          pack.deprecated ? 'Deprecated' : pack.active ? 'Aktif' : 'Pasif',
        ])}
      />
      <DataTable
        headers={['Şablon', 'Tip', 'Varsayılan fiyat', 'Hazırlık', 'Yazıcı', 'Versiyon', 'Import']}
        rows={templates.map((template) => [
          template.name,
          template.restaurantType,
          formatAdminMoney(Number(template.defaultPrice)),
          template.preparationGroup ?? '-',
          template.printerGroupName ?? '-',
          `v${template.version}`,
          importCountByTemplate.get(template.id) ?? 0,
        ])}
      />
    </div>
  );
}


function PackagesModule({ state, packageDraft, setPackageDraft, savePackage, editPackage, resetPackageDraft, deletePackage }: any) {
  const isEditing = state.packages.some((item: AdminPackage) => item.id === packageDraft.id);

  function toggleModule(moduleKey: PackageModuleKey) {
    setPackageDraft((current: AdminPackage) => ({
      ...current,
      modules: current.modules.includes(moduleKey)
        ? current.modules.filter((item) => item !== moduleKey)
        : [...current.modules, moduleKey],
    }));
  }

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{isEditing ? 'Paket düzenle' : 'Paket oluştur'}</h3>
          {isEditing ? <button type="button" onClick={resetPackageDraft} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100">Yeni paket</button> : null}
        </div>
        <div className="mt-5 grid gap-3">
          <input value={packageDraft.name} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, name: e.target.value }))} placeholder="Paket ad?" className="input-dark" />
          <select value={packageDraft.package_type} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, package_type: e.target.value as PackageType, modules: getDefaultModulesForPackageType(e.target.value as PackageType) }))} className="input-dark"><option value="mini">Mini</option><option value="gold">Gold</option><option value="premium">Premium</option></select>
          <input type="number" value={packageDraft.price} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, price: Number(e.target.value) }))} placeholder="Ayl?k fiyat" className="input-dark" />
          <input type="number" value={packageDraft.duration_days} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, duration_days: Number(e.target.value) }))} placeholder="Süre / gün" className="input-dark" />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pakete dahil mod?ller</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PACKAGE_MODULE_OPTIONS.map((module) => (
                <label key={module.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-200">
                  <input type="checkbox" checked={packageDraft.modules.includes(module.key)} onChange={() => toggleModule(module.key)} className="mt-1" />
                  <span>
                    <span className="block font-semibold text-slate-100">{module.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{module.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <textarea value={packageDraft.features.join('\n')} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, features: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="Özellikler" className="input-dark min-h-28 py-3" />
        </div>
        <button type="button" onClick={savePackage} className="btn-blue">{isEditing ? 'Değişiklikleri kaydet' : 'Paketi kaydet'}</button>
      </article>
      <div className="grid gap-4 md:grid-cols-3">{state.packages.map((pkg: AdminPackage) => {
        const usageCount = state.tenants.filter((tenant: AdminTenant) => tenant.package_id === pkg.id).length;
        return <article key={pkg.id} className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">{pkg.package_type}</p><h3 className="mt-2 text-2xl font-semibold">{pkg.name}</h3><p className="mt-2 text-sm text-slate-400">Paket fiyatı</p><p className="mt-1 text-3xl font-semibold">{formatAdminMoney(pkg.price)}</p><p className="mt-1 text-sm text-slate-400">{pkg.duration_days} gün</p><div className="mt-3 text-xs font-semibold text-slate-400">Bağlı abone: {usageCount}</div><div className="mt-4 flex flex-wrap gap-2">{pkg.modules.map((module) => <span key={module} className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-100">{PACKAGE_MODULE_OPTIONS.find((item) => item.key === module)?.label ?? module}</span>)}</div><div className="mt-4 space-y-2">{pkg.features.map((f) => <p key={f} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">{f}</p>)}</div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => editPackage(pkg)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Düzenle</button><button type="button" onClick={() => deletePackage(pkg.id)} disabled={usageCount > 0} className={`rounded-xl px-3 py-2 text-xs font-semibold text-white ${usageCount > 0 ? 'bg-slate-700/60 cursor-not-allowed' : 'bg-rose-600'}`}>Sil</button></div>{usageCount > 0 ? <p className="mt-2 text-xs text-amber-200">Bu paket kullanımda olduğu için silinemez.</p> : null}</article>;
      })}</div>
    </div>
  );
}

function DealersModule({ state, dealerDraft, setDealerDraft, saveDealer, commit }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Bayi / temsilci oluştur</h3>
        <div className="mt-5 grid gap-3">
          <input value={dealerDraft.name} onChange={(e) => setDealerDraft((c: any) => ({ ...c, name: e.target.value }))} placeholder="Ad / firma" className="input-dark" />
          <select value={dealerDraft.type} onChange={(e) => setDealerDraft((c: any) => ({ ...c, type: e.target.value }))} className="input-dark"><option value="dealer">Bayi</option><option value="representative">Satış temsilcisi</option></select>
          <input type="number" value={dealerDraft.commission_rate} onChange={(e) => setDealerDraft((c: any) => ({ ...c, commission_rate: Number(e.target.value) }))} placeholder="Komisyon %" className="input-dark" />
          <input value={dealerDraft.phone} onChange={(e) => setDealerDraft((c: any) => ({ ...c, phone: e.target.value }))} placeholder="Telefon" className="input-dark" />
          <input value={dealerDraft.email} onChange={(e) => setDealerDraft((c: any) => ({ ...c, email: e.target.value }))} placeholder="E-posta" className="input-dark" />
        </div>
        <button type="button" onClick={saveDealer} className="btn-blue">Kaydet</button>
      </article>
      <DataTable headers={['Ad', 'Tip', 'Komisyon', 'Bekleyen hak ediş', 'Durum']} rows={state.dealers.map((dealer: AdminDealer) => {
        const pending = state.commissions.filter((item: any) => item.dealer_id === dealer.id && item.status === 'pending').reduce((sum: number, item: any) => sum + item.amount, 0);
        return [dealer.name, dealer.type === 'dealer' ? 'Bayi' : 'Temsilci', `%${dealer.commission_rate}`, formatAdminMoney(pending), dealer.active ? 'Aktif' : 'Pasif'];
      })} />
      <DataTable headers={['Satış', 'Bayi', 'Abone', 'Hak ediş', 'Durum']} rows={state.commissions.map((item: any) => [
        item.sale_id,
        state.dealers.find((dealer: AdminDealer) => dealer.id === item.dealer_id)?.name ?? '-',
        item.tenant_id,
        formatAdminMoney(item.amount),
        <button key={item.id} type="button" onClick={() => commit({ ...state, commissions: state.commissions.map((com: any) => com.id === item.id ? { ...com, status: 'paid', paid_at: today() } : com), sales: state.sales.map((sale: AdminSale) => sale.id === item.sale_id ? { ...sale, commission_status: 'paid' } : sale) })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold">{item.status === 'paid' ? 'Ödendi' : 'Öde'}</button>,
      ])} />
    </div>
  );
}

function SalesModule({ state, saleDraft, setSaleDraft, addSale }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Satış kaydı</h3>
        <div className="mt-5 grid gap-3">
          <SelectTenant state={state} value={saleDraft.tenant_id} onChange={(value) => setSaleDraft((c: any) => ({ ...c, tenant_id: value }))} />
          <select value={saleDraft.package_id} onChange={(e) => setSaleDraft((c: any) => ({ ...c, package_id: e.target.value, amount: state.packages.find((pkg: AdminPackage) => pkg.id === e.target.value)?.price ?? c.amount }))} className="input-dark">{state.packages.map((pkg: AdminPackage) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select>
          <select value={saleDraft.dealer_id} onChange={(e) => { const dealer = state.dealers.find((d: AdminDealer) => d.id === e.target.value); setSaleDraft((c: any) => ({ ...c, dealer_id: e.target.value, seller: dealer?.name ?? c.seller, commission_rate: dealer?.commission_rate ?? 0 })); }} className="input-dark">{state.dealers.map((dealer: AdminDealer) => <option key={dealer.id} value={dealer.id}>{dealer.name}</option>)}</select>
          <input type="number" value={saleDraft.amount} onChange={(e) => setSaleDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" />
          <input type="number" value={saleDraft.commission_rate} onChange={(e) => setSaleDraft((c: any) => ({ ...c, commission_rate: Number(e.target.value) }))} placeholder="Komisyon %" className="input-dark" />
          <input type="date" value={saleDraft.date} onChange={(e) => setSaleDraft((c: any) => ({ ...c, date: e.target.value }))} className="input-dark" />
        </div>
        <button type="button" onClick={addSale} className="btn-violet">Satış ekle ve komisyon oluştur</button>
      </article>
      <DataTable headers={['Abone', 'Paket', 'Satışçı', 'Tutar', 'Komisyon', 'Durum']} rows={state.sales.map((item: AdminSale) => [item.tenant_id, item.package_id, item.seller, formatAdminMoney(item.amount), formatAdminMoney(item.commission_amount), item.commission_status])} />
    </div>
  );
}

function PaymentsModule({ state, paymentDraft, setPaymentDraft, processPayment }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Ödeme ve yenileme</h3>
        <div className="mt-5 grid gap-3">
          <SelectTenant state={state} value={paymentDraft.tenant_id} onChange={(value) => {
            const tenant = state.tenants.find((item: AdminTenant) => item.tenant_id === value);
            const pkg = state.packages.find((item: AdminPackage) => item.id === tenant?.package_id);
            setPaymentDraft((c: any) => ({ ...c, tenant_id: value, amount: pkg?.price ?? c.amount }));
          }} />
          <select value={paymentDraft.invoice_id ?? ''} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, invoice_id: e.target.value }))} className="input-dark"><option value="">Fatura seçme</option>{state.invoices.map((inv: AdminInvoice) => <option key={inv.id} value={inv.id}>{inv.invoice_no} - {formatAdminMoney(inv.amount)}</option>)}</select>
          <select value={paymentDraft.provider} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, provider: e.target.value }))} className="input-dark"><option value="manual">Manuel</option><option value="iyzico">Iyzico</option><option value="paytr">PayTR</option></select>
          <input type="number" value={paymentDraft.amount} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => processPayment(true)} className="btn-green">Başarılı ödeme</button>
          <button type="button" onClick={() => processPayment(false)} className="h-12 rounded-2xl bg-rose-600 text-sm font-semibold">Başarısız ödeme</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Başarılı ödeme aboneliği otomatik uzatır, fatura ve gelir kaydı oluşturur.</p>
      </article>
      <DataTable headers={['Abone', 'Sağlayıcı', 'Tutar', 'Durum', 'İşlem No']} rows={state.payments.map((item: AdminPayment) => [item.tenant_id, item.provider, formatAdminMoney(item.amount), item.status, item.transaction_id])} />
      <DataTable headers={['Abone', 'Eski bitiş', 'Yeni bitiş', 'Durum']} rows={state.renewals.map((item: any) => [item.tenant_id, item.old_end_date, item.new_end_date, item.status])} />
    </div>
  );
}

function FinanceModule({ state, financeDraft, setFinanceDraft, addFinanceTransaction }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5"><h3 className="text-xl font-semibold">Gelir / gider hareketi</h3><div className="mt-5 grid gap-3"><select value={financeDraft.type} onChange={(e) => setFinanceDraft((c: any) => ({ ...c, type: e.target.value }))} className="input-dark"><option value="income">Gelir</option><option value="expense">Gider</option></select><input value={financeDraft.source} onChange={(e) => setFinanceDraft((c: any) => ({ ...c, source: e.target.value }))} placeholder="Kaynak" className="input-dark" /><SelectTenant state={state} value={financeDraft.tenant_id ?? ''} onChange={(value) => setFinanceDraft((c: any) => ({ ...c, tenant_id: value || undefined }))} allowEmpty /><input type="number" value={financeDraft.amount} onChange={(e) => setFinanceDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" /><input type="date" value={financeDraft.date} onChange={(e) => setFinanceDraft((c: any) => ({ ...c, date: e.target.value }))} className="input-dark" /><textarea value={financeDraft.note} onChange={(e) => setFinanceDraft((c: any) => ({ ...c, note: e.target.value }))} placeholder="Not" className="input-dark min-h-24 py-3" /></div><button type="button" onClick={addFinanceTransaction} className="btn-green">Hareket ekle</button></article>
      <DataTable headers={['Tip', 'Kaynak', 'Tenant', 'Tutar', 'Tarih']} rows={state.finance.map((item: any) => [item.type === 'income' ? 'Gelir' : 'Gider', item.source, item.tenant_id ?? 'Genel', formatAdminMoney(item.amount), item.date])} />
    </div>
  );
}

function InvoiceModule({ state, invoiceDraft, setInvoiceDraft, addInvoice }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5"><h3 className="text-xl font-semibold">Fatura oluştur</h3><div className="mt-5 grid gap-3"><SelectTenant state={state} value={invoiceDraft.tenant_id} onChange={(value) => setInvoiceDraft((c: any) => ({ ...c, tenant_id: value }))} /><select value={invoiceDraft.type} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, type: e.target.value }))} className="input-dark"><option value="subscription">Abonelik</option><option value="payment">Tahsilat</option></select><input type="number" value={invoiceDraft.amount} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" /><select value={invoiceDraft.status} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, status: e.target.value }))} className="input-dark"><option value="draft">Taslak</option><option value="issued">Kesildi</option><option value="paid">Ödendi</option><option value="cancelled">İptal</option></select><input type="date" value={invoiceDraft.issue_date} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, issue_date: e.target.value }))} className="input-dark" /><input type="date" value={invoiceDraft.due_date} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, due_date: e.target.value }))} className="input-dark" /></div><button type="button" onClick={addInvoice} className="btn-blue">Fatura ekle</button></article>
      <DataTable headers={['No', 'Tenant', 'Tip', 'Tutar', 'Durum']} rows={state.invoices.map((item: AdminInvoice) => [item.invoice_no, item.tenant_id, item.type, formatAdminMoney(item.amount), item.status])} />
    </div>
  );
}

function ReportsModule({ state, dashboard }: { state: SystemAdminState; dashboard: any }) {
  const dealerRows = state.dealers.map((dealer) => {
    const sales = state.sales.filter((sale) => sale.dealer_id === dealer.id);
    const amount = sales.reduce((sum, sale) => sum + sale.amount, 0);
    const commission = state.commissions.filter((item) => item.dealer_id === dealer.id).reduce((sum, item) => sum + item.amount, 0);
    return [dealer.name, dealer.type, sales.length, formatAdminMoney(amount), formatAdminMoney(commission)];
  });
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-3"><Metric label="Net kâr" value={formatAdminMoney(dashboard.net)} /><Metric label="Açık fatura" value={formatAdminMoney(dashboard.unpaidInvoices)} /><Metric label="Bekleyen hak ediş" value={formatAdminMoney(dashboard.pendingCommissions)} /></div>
      <DataTable headers={['Bayi / temsilci', 'Tip', 'Satış adedi', 'Satış tutarı', 'Hak ediş']} rows={dealerRows} />
    </div>
  );
}

function SelectTenant({ state, value, onChange, allowEmpty = false }: { state: SystemAdminState; value: string; onChange: (value: string) => void; allowEmpty?: boolean }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="input-dark">{allowEmpty ? <option value="">Tenant yok / genel</option> : <option value="">Abone seç</option>}{state.tenants.map((tenant) => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.company_name}</option>)}</select>;
}

// Monitoring Module

type MonTabId = 'overview' | 'commercial' | 'pilot' | 'release' | 'incidents' | 'health' | 'anomalies' | 'security' | 'queues' | 'advisor' | 'healing' | 'resilience' | 'audit' | 'logs';

type ObsServerSnapshot = { uptimeSeconds: number; nodeVersion: string; memUsedMb: number; memTotalMb: number; pm2Instance: string | null; redisStatus: string; postgresStatus: string; postgresConnections: number; wsConfigured: boolean; generatedAt: string };
type ObsTenantRow = { tenantId: string; companyName: string; requestCount: number; errorCount: number; errorRate: string; avgResponseMs: string; lastResponseMs: number; websocketHealth: string; printerHealth: string; syncFailures: number; printerOnlineCount?: number; printerTotalCount?: number };
type ObsLogEntry = { id: string; level: string; message: string; service?: string; tenantId?: string; at: string };
type ObsSlowQuery = { id: string; durationMs: number; query: string; at: string };
type ObsIncident = { id: string; type: string; tenantId?: string; status: string; title: string; description: string; openedAt: string; autoMitigated: boolean };
type ObsAnomaly = { id: string; type: string; tenantId?: string; description: string; severity: string; deviationFactor: number; detectedAt: string; resolved: boolean };
type ObsAlert = { id: string; severity: string; title: string; message: string; tenantId?: string; service?: string; firedAt: string; deliveredTo: string[] };
type ObsHealthScore = { tenantId: string; companyName: string; score: number; grade: string; trend: string; insights: string[]; components: Record<string, number> };
type ObsSecEvent = { id: string; type: string; tenantId?: string; ip?: string; severity: string; description: string; blocked: boolean; detectedAt: string };
type ObsAuditEntry = { id: string; category: string; action: string; actorId: string; tenantId?: string; at: string };
type ObsAdvisory = { id: string; category: string; tenantId?: string; severity: string; title: string; recommendation: string; metrics: Record<string, number | string> };
type ObsQueueMetric = { queue: string; pending: number; processing: number; completed: number; failed: number; dead: number; throughputLastMinute: number };
type ObsHealingEvent = { id: string; action: string; tenantId?: string; status: string; detail: string; triggeredAt: string; autoResolved: boolean };
type ObsBackupRun = { id: string; category: string; mode: string; status: string; completedAt: string; sizeBytes: number; encrypted: boolean };
type ObsRestoreRun = { id: string; type: string; status: string; startedAt: string; durationMs: number; simulated?: boolean; error?: string; details: string[] };
type ObsValidation = { id: string; status: string; checkedBackups: number; corruptedBackups: string[]; details: string[]; completedAt: string } | null;
type ObsRecoveryReport = { recoveryReadinessScore: number; backupMaturityScore: number; haReadinessScore: number; rpoMinutesEstimate: number; rtoMinutesEstimate: number; restoreSuccessRate: number } | null;
type ObsHAReadiness = { score: number; risks: string[]; cluster: { instanceCount: number; targetInstanceCount: number } } | null;
type ObsOperationMode = { mode: string; reason: string; changedAt: string; readOnly: boolean; modeScore: number } | null;
type ObsPlaybookRun = { id: string; type: string; status: string; startedAt: string; durationMs: number };
type ObsPilotRestaurant = {
  tenantId: string;
  restaurantName: string;
  restaurantHealthScore: number;
  printStabilityScore: number;
  fiscalReadinessScore: number;
  offlineRecoveryScore: number;
  realWorldProductionReadinessScore: number;
  metrics: Record<string, number>;
  topRisks: string[];
  deviceReliabilityMatrix: Array<{ deviceId: string; type: string; vendor: string; failures: number; reconnects: number; latencyMs: number; healthScore: number }>;
};
type ObsPilotField = {
  pilotCount: number;
  unhealthyRestaurants: number;
  failingDevices: number;
  offlineRestaurants: number;
  fiscalIssues: number;
  printStabilityScore: number;
  fiscalReadinessScore: number;
  realWorldProductionReadinessScore: number;
  restaurants: ObsPilotRestaurant[];
  recentEvents: Array<{ id: string; tenantId: string; type: string; severity: string; at: string; source: string; message: string; metrics: Record<string, number | string | boolean> }>;
} | null;
type ObsCommercialOps = {
  activeTenants: number;
  unhealthyTenants: number;
  expiringLicenses: number;
  failingDevices: number;
  pilotRestaurants: number;
  revenueMetrics: { totalRevenue: number; successfulPayments: number; pendingInvoices: number };
  supportMetrics: {
    openSupportSessions: number;
    queuedRemoteCommands: number;
    recentRemoteCommands: Array<{ id: string; tenantId: string; action: string; deviceId?: string; status: string; createdAt: string }>;
    recentSupportSessions: Array<{ id: string; tenantId: string; status: string; permissions: string[]; expiresAt: string }>;
  };
  licenseMetrics: { trial: number; active: number; suspended: number; expired: number; expiring: Array<{ tenantId: string; status: string; expiresAt: string; printerLimit: number; branchLimit: number; userLimit: number }> };
  resellerMetrics: { activeDealers: number; tenantsByDealer: Array<{ dealerId: string; name: string; tenantCount: number; commissionPending: number }> };
  installer: { signedInstaller: boolean; autoUpdate: boolean; silentInstall: boolean; healthCheckUrl: string };
  recommendations: Array<{ severity: string; title: string; recommendation: string; tenantId?: string }>;
  scores: { commercializationReadinessScore: number; supportMaturityScore: number; deploymentReadinessScore: number; resellerReadinessScore: number; fieldOperationsMaturityScore: number };
} | null;

type ObsReleaseRow = {
  tenantId: string;
  companyName: string;
  releaseVersion: string;
  releaseChannel: string;
  rolloutTrack: string;
  updateStatus: string;
  updateLatencyMs: number;
  rollbackCount: number;
  outdated: boolean;
  releaseTarget?: string;
  releaseSource?: string;
  updatedAt: string;
};

type ObsPayload = {
  server: ObsServerSnapshot;
  tenants: ObsTenantRow[];
  logs: ObsLogEntry[];
  slowQueries: ObsSlowQuery[];
  incidents?: ObsIncident[];
  incidentStats?: { total: number; open: number; escalated: number; mitigating: number } | null;
  alerts?: ObsAlert[];
  alertStats?: { total: number; last24h: number; bySeverity: Record<string, number> } | null;
  anomalies?: ObsAnomaly[];
  anomalyStats?: { total: number; unresolved: number; bySeverity: Record<string, number> } | null;
  healthScores?: ObsHealthScore[];
  healthSummary?: { avgScore: number; unhealthyCount: number; criticalCount: number; tenantCount: number } | null;
  securityStats?: { total: number; last24h: number; blockedIps: number; bySeverity: Record<string, number> } | null;
  securityEvents?: ObsSecEvent[];
  auditStats?: { total: number; last24h: number; sensitiveActions: number } | null;
  recentAudit?: ObsAuditEntry[];
  advisories?: ObsAdvisory[];
  queueMetrics?: ObsQueueMetric[];
  healingEvents?: ObsHealingEvent[];
  healingStats?: { totalEvents: number; resolved: number; inProgress: number; failed: number; runCount: number } | null;
  backupStats?: { totalRuns: number; successCount: number; failedCount: number; lastBackupAt: string | null; totalBackupSizeMb: number; backupHealthScore: number } | null;
  backupRuns?: ObsBackupRun[];
  recoveryReport?: ObsRecoveryReport;
  recentRestores?: ObsRestoreRun[];
  latestValidation?: ObsValidation;
  haReadiness?: ObsHAReadiness;
  operationMode?: ObsOperationMode;
  playbookRuns?: ObsPlaybookRun[];
  pilotField?: ObsPilotField;
  commercialOps?: ObsCommercialOps;
  operationalIntelligence?: Array<{
    tenantId: string;
    companyName: string;
    healthScore: number;
    operationalScore: number;
    stockAccuracyScore: number;
    onboardingCompletenessScore: number;
    alerts: Array<{ code: string; severity: string; title: string }>;
  }>;
  releases?: ObsReleaseRow[];
  releaseSummary?: { total: number; failedUpdates: number; outdatedTenants: number; rollbackEvents: number; avgUpdateLatencyMs: number; byChannel: Record<string, number> } | null;
  generatedAt: string;
};

function statusBadge(value: string, ok: string[], warn: string[] = []) {
  const lv = value.toLowerCase();
  const isOk = ok.includes(lv);
  const isWarn = warn.includes(lv);
  const cls = isOk ? 'bg-emerald-500/20 text-emerald-300' : isWarn ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{value}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{children}</h3>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function obsAction(action: string, extra?: Record<string, string>) {
  return fetch('/api/system-admin/observability/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  }).catch(() => undefined);
}

function MonitoringModule() {
  const [data, setData] = useState<ObsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<MonTabId>('overview');

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/system-admin/observability');
      if (!res.ok) { setError('API erisim hatasi (' + res.status + ')'); setLoading(false); return; }
      const json = await res.json() as ObsPayload;
      setData(json);
      setError('');
    } catch { setError('Baglanti hatasi'); }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(t);
  }, [autoRefresh]);

  if (loading && !data) return <div className="mt-8 text-slate-400 text-sm">Observability verisi yukleniyor...</div>;
  if (error) return <div className="mt-8 rounded-2xl bg-rose-500/15 px-5 py-4 text-rose-200 text-sm">{error}</div>;
  if (!data) return null;

  const s = data.server;
  const uptimeHours = (s.uptimeSeconds / 3600).toFixed(1);
  const memPct = Math.round((s.memUsedMb / s.memTotalMb) * 100);
  const openIncidents = (data.incidents ?? []).filter((i) => i.status !== 'resolved');
  const unresolvedAnomalies = (data.anomalies ?? []).filter((a) => !a.resolved);

  const tabs: Array<{ id: MonTabId; label: string; badge?: number }> = [
    { id: 'overview', label: 'Genel Bakis', badge: openIncidents.length > 0 ? openIncidents.length : undefined },
    { id: 'commercial', label: 'Commercial Ops', badge: data.commercialOps?.expiringLicenses || undefined },
    { id: 'pilot', label: 'Pilot Saha', badge: data.pilotField?.unhealthyRestaurants || undefined },
    { id: 'release', label: 'Release', badge: data.releaseSummary?.outdatedTenants || undefined },
    { id: 'incidents', label: 'Incidents', badge: openIncidents.length },
    { id: 'health', label: 'Health Score' },
    { id: 'anomalies', label: 'Anomaliler', badge: unresolvedAnomalies.filter((a) => a.severity === 'high').length || undefined },
    { id: 'security', label: 'Güvenlik', badge: (data.securityStats?.bySeverity.critical ?? 0) + (data.securityStats?.bySeverity.high ?? 0) || undefined },
    { id: 'queues', label: 'Kuyruklar' },
    { id: 'advisor', label: 'Performans' },
    { id: 'healing', label: 'Self-Healing' },
    { id: 'resilience', label: 'Resilience', badge: (data.operationMode?.mode !== 'normal' && data.operationMode?.mode) ? 1 : undefined },
    { id: 'audit', label: 'Audit Trail' },
    { id: 'logs', label: 'Loglar' },
  ];
  const selectedTab: MonTabId = activeTab;

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void refresh()} className="rounded-xl bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/35">Yenile</button>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-blue-500" />
          Oto 30s
        </label>
        {loading ? <span className="text-[11px] text-blue-400">Yenileniyor...</span> : null}
        <span className="ml-auto text-[11px] text-slate-500">{new Date(data.generatedAt).toLocaleTimeString('tr-TR')}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Incidents" value={openIncidents.length} sub={openIncidents.filter((i) => i.status === 'escalated').length + ' escalated'} />
        <StatCard label="Anomali" value={unresolvedAnomalies.length} sub={unresolvedAnomalies.filter((a) => a.severity === 'high').length + ' yuksek'} />
        <StatCard label="Uyarilar (24h)" value={data.alertStats?.last24h ?? 0} sub={(data.alertStats?.bySeverity.critical ?? 0) + ' kritik'} />
        <StatCard label="Güvenlik (24h)" value={data.securityStats?.last24h ?? 0} sub={(data.securityStats?.blockedIps ?? 0) + ' IP blok'} />
        <StatCard label="Health Avg" value={(data.healthSummary?.avgScore ?? 0) + '/100'} sub={(data.healthSummary?.unhealthyCount ?? 0) + ' sagliksiz tenant'} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-white/4 p-1">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-blue-600/30 text-blue-200' : 'text-slate-400 hover:text-slate-200'}`}>
            {tab.label}
            {tab.badge ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-5">
          <div>
            <SectionTitle>Sunucu Sagligi</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Uptime" value={uptimeHours + ' saat'} />
              <StatCard label="Bellek" value={s.memUsedMb + ' / ' + s.memTotalMb + ' MB (' + memPct + '%)'} />
              <StatCard label="Node" value={s.nodeVersion} />
              <StatCard label="PM2" value={s.pm2Instance ? 'Instance ' + s.pm2Instance : '-'} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <span className="text-xs text-slate-400">PostgreSQL</span>{statusBadge(s.postgresStatus, ['ok'])}
                <span className="ml-auto text-xs text-slate-500">{s.postgresConnections} conn</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <span className="text-xs text-slate-400">Redis</span>{statusBadge(s.redisStatus, ['ok', 'pong'])}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <span className="text-xs text-slate-400">WebSocket</span>{statusBadge(s.wsConfigured ? 'configured' : 'missing', ['configured'])}
              </div>
            </div>
          </div>
          {data.tenants.length > 0 && (
            <div>
              <SectionTitle>Tenant Sagligi</SectionTitle>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['Abone','Istek','Hata %','Ort. ms','WebSocket','Yazici','Sync'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                  <tbody>{data.tenants.map((row) => (
                    <tr key={row.tenantId} className="border-b border-white/5 hover:bg-white/4">
                      <td className="px-4 py-3 font-semibold text-white">{row.companyName || row.tenantId.slice(0,12)}</td>
                      <td className="px-4 py-3 text-slate-300">{row.requestCount}</td>
                      <td className="px-4 py-3">{statusBadge(String(row.errorRate) + '%', parseFloat(String(row.errorRate)) < 5 ? [String(row.errorRate) + '%'] : [], parseFloat(String(row.errorRate)) < 15 ? [String(row.errorRate) + '%'] : [])}</td>
                      <td className="px-4 py-3 text-slate-300">{Number(row.avgResponseMs).toFixed(0)} ms</td>
                      <td className="px-4 py-3">{statusBadge(row.websocketHealth, ['healthy', 'connected'], ['unknown'])}</td>
                      <td className="px-4 py-3">{statusBadge(row.printerHealth, ['healthy', 'online'], ['unknown'])}</td>
                      <td className="px-4 py-3">{row.syncFailures > 0 ? <span className="text-amber-300 font-semibold">{row.syncFailures}</span> : <span className="text-slate-500">0</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {(data.operationalIntelligence ?? []).length > 0 && (
            <div>
              <SectionTitle>Operasyon Zekasi</SectionTitle>
              <div className="grid gap-2">
                {(data.operationalIntelligence ?? []).slice(0, 5).map((tenant) => (
                  <div key={tenant.tenantId} className="grid gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 md:grid-cols-[1.2fr_repeat(4,0.6fr)]">
                    <div>
                      <p className="font-semibold text-white">{tenant.companyName}</p>
                      <p className="text-[11px] text-slate-500">{tenant.tenantId}</p>
                    </div>
                    <p className="text-xs text-slate-300">Saglik <strong>{tenant.healthScore}</strong></p>
                    <p className="text-xs text-slate-300">Operasyon <strong>{tenant.operationalScore}</strong></p>
                    <p className="text-xs text-slate-300">Stok <strong>{tenant.stockAccuracyScore}</strong></p>
                    <p className="text-xs text-slate-300">Uyari <strong>{tenant.alerts.length}</strong></p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'commercial' && (
        <div className="grid gap-5">
          <SectionTitle>Commercial Operations Dashboard</SectionTitle>
          {!data.commercialOps ? (
            <p className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-400">Commercial operations verisi henuz uretilmedi.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Active Tenants" value={data.commercialOps.activeTenants} />
                <StatCard label="Unhealthy" value={data.commercialOps.unhealthyTenants} />
                <StatCard label="Expiring License" value={data.commercialOps.expiringLicenses} />
                <StatCard label="Queued Commands" value={data.commercialOps.supportMetrics.queuedRemoteCommands} />
                <StatCard label="Revenue" value={formatAdminMoney(data.commercialOps.revenueMetrics.totalRevenue)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Commercial Ready" value={data.commercialOps.scores.commercializationReadinessScore + '/100'} />
                <StatCard label="Support Maturity" value={data.commercialOps.scores.supportMaturityScore + '/100'} />
                <StatCard label="Deployment Ready" value={data.commercialOps.scores.deploymentReadinessScore + '/100'} />
                <StatCard label="Reseller Ready" value={data.commercialOps.scores.resellerReadinessScore + '/100'} />
                <StatCard label="Field Ops" value={data.commercialOps.scores.fieldOperationsMaturityScore + '/100'} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                  <SectionTitle>License Management</SectionTitle>
                  <div className="grid grid-cols-4 gap-2">
                    <StatCard label="Trial" value={data.commercialOps.licenseMetrics.trial} />
                    <StatCard label="Active" value={data.commercialOps.licenseMetrics.active} />
                    <StatCard label="Suspended" value={data.commercialOps.licenseMetrics.suspended} />
                    <StatCard label="Expired" value={data.commercialOps.licenseMetrics.expired} />
                  </div>
                  <div className="mt-3 grid gap-2">
                    {data.commercialOps.licenseMetrics.expiring.slice(0, 5).map((license) => (
                      <div key={license.tenantId} className="flex items-center gap-3 rounded-xl bg-[#0B1220]/70 px-4 py-3 text-xs">
                        <span className="font-semibold text-white">{license.tenantId}</span>
                        {statusBadge(license.status, ['active', 'trial'], ['suspended'])}
                        <span className="ml-auto text-slate-400">{new Date(license.expiresAt).toLocaleDateString('tr-TR')}</span>
                      </div>
                    ))}

                    {selectedTab === 'release' && (
                      <div className="grid gap-5">
                        <SectionTitle>Release Lifecycle</SectionTitle>
                        {!data.releases ? (
                          <p className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-400">Release telemetry henuz gelmedi.</p>
                        ) : (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                              <StatCard label="Runtime" value={data.releaseSummary?.total ?? 0} sub="release telemetry" />
                              <StatCard label="Failed" value={data.releaseSummary?.failedUpdates ?? 0} sub="update failure" />
                              <StatCard label="Outdated" value={data.releaseSummary?.outdatedTenants ?? 0} sub="legacy tenants" />
                              <StatCard label="Rollbacks" value={data.releaseSummary?.rollbackEvents ?? 0} sub="tenant rollbacks" />
                              <StatCard label="Latency" value={Math.round(data.releaseSummary?.avgUpdateLatencyMs ?? 0) + ' ms'} sub="avg update time" />
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-white/8">
                              <table className="w-full text-xs">
                                <thead className="border-b border-white/8 bg-white/4"><tr>{['Tenant','Version','Channel','Track','Status','Latency','Rollback','Outdated'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                                <tbody>{data.releases.slice(0, 20).map((row) => (
                                  <tr key={row.tenantId} className="border-b border-white/5 hover:bg-white/4">
                                    <td className="px-4 py-3 font-semibold text-white">{row.companyName}</td>
                                    <td className="px-4 py-3 text-slate-300">{row.releaseVersion}</td>
                                    <td className="px-4 py-3">{statusBadge(row.releaseChannel, ['stable', 'beta', 'pilot', 'internal', 'hotfix'])}</td>
                                    <td className="px-4 py-3 text-slate-300">{row.rolloutTrack}</td>
                                    <td className="px-4 py-3">{statusBadge(row.updateStatus, ['completed', 'success', 'stable'])}</td>
                                    <td className="px-4 py-3 text-slate-300">{Math.round(row.updateLatencyMs)} ms</td>
                                    <td className="px-4 py-3 text-slate-300">{row.rollbackCount}</td>
                                    <td className="px-4 py-3">{row.outdated ? statusBadge('outdated', [], ['outdated']) : statusBadge('current', ['current'])}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                  <SectionTitle>Remote Support</SectionTitle>
                  <div className="grid gap-2">
                    {data.commercialOps.supportMetrics.recentRemoteCommands.slice(0, 6).map((command) => (
                      <div key={command.id} className="flex items-center gap-3 rounded-xl bg-[#0B1220]/70 px-4 py-3 text-xs">
                        <span className="font-semibold text-slate-200">{command.action.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">{command.tenantId}</span>
                        <span className="ml-auto">{statusBadge(command.status, ['acknowledged', 'sent'], ['queued'])}</span>
                      </div>
                    ))}
                    {data.commercialOps.supportMetrics.recentRemoteCommands.length === 0 ? <p className="text-xs text-slate-500">Remote command yok.</p> : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                  <SectionTitle>Reseller / Bayi</SectionTitle>
                  <div className="grid gap-2">
                    {data.commercialOps.resellerMetrics.tenantsByDealer.slice(0, 6).map((dealer) => (
                      <div key={dealer.dealerId} className="flex items-center gap-3 rounded-xl bg-[#0B1220]/70 px-4 py-3 text-xs">
                        <span className="font-semibold text-white">{dealer.name}</span>
                        <span className="text-slate-400">{dealer.tenantCount} tenant</span>
                        <span className="ml-auto text-amber-300">{formatAdminMoney(dealer.commissionPending)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                  <SectionTitle>Auto Support Recommendations</SectionTitle>
                  <div className="grid gap-2">
                    {data.commercialOps.recommendations.slice(0, 6).map((rec, index) => (
                      <div key={`${rec.title}-${index}`} className="rounded-xl bg-[#0B1220]/70 px-4 py-3 text-xs">
                        <div className="flex items-center gap-2">{statusBadge(rec.severity, ['info'], ['warning'])}<span className="font-semibold text-white">{rec.title}</span></div>
                        <p className="mt-1 text-slate-400">{rec.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <SectionTitle>Installation Package</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-4">
                  <StatCard label="Signed Installer" value={data.commercialOps.installer.signedInstaller ? 'Ready' : 'Missing'} />
                  <StatCard label="Auto Update" value={data.commercialOps.installer.autoUpdate ? 'Ready' : 'Missing'} />
                  <StatCard label="Silent Install" value={data.commercialOps.installer.silentInstall ? 'Ready' : 'Missing'} />
                  <StatCard label="Health Check" value={data.commercialOps.installer.healthCheckUrl} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'pilot' && (
        <div className="grid gap-5">
          <SectionTitle>Pilot Operations Dashboard</SectionTitle>
          {!data.pilotField || data.pilotField.pilotCount === 0 ? (
            <p className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4 text-sm text-slate-400">Pilot tenant verisi henuz yok. Desktop bridge telemetry veya field runner ingest bekleniyor.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Pilot Restaurant" value={data.pilotField.pilotCount} />
                <StatCard label="Sagliksiz" value={data.pilotField.unhealthyRestaurants} />
                <StatCard label="Failing Device" value={data.pilotField.failingDevices} />
                <StatCard label="Print Stability" value={data.pilotField.printStabilityScore + '/100'} />
                <StatCard label="Production Ready" value={data.pilotField.realWorldProductionReadinessScore + '/100'} />
              </div>
              <div className="grid gap-3">
                {data.pilotField.restaurants.map((restaurant) => (
                  <div key={restaurant.tenantId} className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{restaurant.restaurantName}</p>
                        <p className="text-[11px] text-slate-500">{restaurant.tenantId}</p>
                      </div>
                      <span className={`rounded-xl px-3 py-1 text-xs font-bold ${restaurant.restaurantHealthScore >= 85 ? 'bg-emerald-500/15 text-emerald-300' : restaurant.restaurantHealthScore >= 70 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>{restaurant.restaurantHealthScore}/100</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <StatCard label="Print" value={restaurant.printStabilityScore} />
                      <StatCard label="Fiscal" value={restaurant.fiscalReadinessScore} />
                      <StatCard label="Offline" value={restaurant.offlineRecoveryScore} />
                      <StatCard label="Real World" value={restaurant.realWorldProductionReadinessScore} />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-[#0B1220]/70 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top Risk</p>
                        <p className="mt-1 text-xs text-slate-300">{restaurant.topRisks.join(' - ')}</p>
                      </div>
                      <div className="rounded-xl bg-[#0B1220]/70 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Field Metrics</p>
                        <p className="mt-1 text-xs text-slate-300">Print retry {restaurant.metrics.printRetries ?? 0} / WS reconnect {restaurant.metrics.websocketReconnects ?? 0} / Offline {restaurant.metrics.offlineDurationSec ?? 0}s</p>
                      </div>
                    </div>
                    {restaurant.deviceReliabilityMatrix.length > 0 ? (
                      <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
                        <table className="w-full text-xs">
                          <thead className="border-b border-white/8 bg-white/4"><tr>{['Device','Type','Vendor','Health','Reconnect','Latency'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                          <tbody>{restaurant.deviceReliabilityMatrix.slice(0, 6).map((device) => (
                            <tr key={device.deviceId} className="border-b border-white/5">
                              <td className="px-3 py-2 text-slate-300">{device.deviceId}</td>
                              <td className="px-3 py-2 text-slate-400">{device.type}</td>
                              <td className="px-3 py-2 text-slate-400">{device.vendor}</td>
                              <td className="px-3 py-2">{statusBadge(String(device.healthScore), device.healthScore >= 85 ? [String(device.healthScore)] : [], device.healthScore >= 70 ? [String(device.healthScore)] : [])}</td>
                              <td className="px-3 py-2 text-slate-300">{device.reconnects}</td>
                              <td className="px-3 py-2 text-slate-300">{device.latencyMs} ms</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div>
                <SectionTitle>Recent Field Events</SectionTitle>
                <div className="grid gap-2">
                  {data.pilotField.recentEvents.slice(0, 8).map((event) => (
                    <div key={event.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-xs">
                      {statusBadge(event.severity, ['info'], ['warning'])}
                      <span className="font-semibold text-slate-200">{event.type.replace(/_/g, ' ')}</span>
                      <span className="flex-1 truncate text-slate-400">{event.message}</span>
                      <span className="text-slate-500">{new Date(event.at).toLocaleTimeString('tr-TR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="grid gap-4">
          <SectionTitle>Aktif Incident'lar ({openIncidents.length})</SectionTitle>
          {openIncidents.length === 0 ? <p className="text-sm text-emerald-400">Aktif incident yok.</p> : (
            <div className="grid gap-3">{openIncidents.map((inc) => (
              <div key={inc.id} className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">{statusBadge(inc.status, ['resolved'], ['mitigating', 'acknowledging'])}<span className="text-xs font-semibold text-white">{inc.title}</span></div>
                    <p className="mt-1 text-[11px] text-slate-400">{inc.description}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{new Date(inc.openedAt).toLocaleString('tr-TR')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={async () => { await obsAction('acknowledge_incident', { incidentId: inc.id }); void refresh(); }} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25">Onayla</button>
                    <button type="button" onClick={async () => { await obsAction('resolve_incident', { incidentId: inc.id }); void refresh(); }} className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25">Coz</button>
                  </div>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <div className="grid gap-4">
          <SectionTitle>Tenant Health Scorecard</SectionTitle>
          {(data.healthScores ?? []).length === 0 ? <p className="text-sm text-slate-400">Henuz yeterli metrik yok.</p> : (
            <div className="grid gap-3">{(data.healthScores ?? []).map((hs) => (
              <div key={hs.tenantId} className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black ${hs.score >= 90 ? 'bg-emerald-500/20 text-emerald-300' : hs.score >= 75 ? 'bg-blue-500/20 text-blue-300' : hs.score >= 60 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'}`}>{hs.grade}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold text-white">{hs.companyName}</span><span className="text-xs text-slate-400">{hs.score}/100</span></div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-white/8"><div className={`h-2 rounded-full ${hs.score >= 75 ? 'bg-emerald-500' : hs.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: hs.score + '%' }} /></div>
                    <p className="mt-1 text-[11px] text-slate-400">{hs.insights.join(' - ')}</p>
                  </div>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="grid gap-4">
          <SectionTitle>Anomali Tespitleri</SectionTitle>
          {(data.anomalies ?? []).length === 0 ? <p className="text-sm text-emerald-400">Anomali tespit edilmedi.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-white/8">
              <table className="w-full text-xs">
                <thead className="border-b border-white/8 bg-white/4"><tr>{['Tip','Tenant','Aciklama','Sapma','Onem','Zaman',''].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                <tbody>{(data.anomalies ?? []).map((a) => (
                  <tr key={a.id} className={`border-b border-white/5 ${a.resolved ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-slate-300">{a.type.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 text-slate-400">{a.tenantId?.slice(0,12) ?? '-'}</td>
                    <td className="max-w-[300px] truncate px-4 py-3 text-slate-300">{a.description}</td>
                    <td className="px-4 py-3 text-amber-300">{a.deviationFactor.toFixed(1)}o</td>
                    <td className="px-4 py-3">{statusBadge(a.severity, ['low'], ['medium'])}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(a.detectedAt).toLocaleTimeString('tr-TR')}</td>
                    <td className="px-4 py-3">{!a.resolved && <button type="button" onClick={async () => { await obsAction('resolve_anomaly', { anomalyId: a.id }); void refresh(); }} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">v</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div className="grid gap-4">
          <SectionTitle>Güvenlik Olayları</SectionTitle>
          {data.securityStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Toplam (24h)" value={data.securityStats.last24h} />
              <StatCard label="Kritik" value={data.securityStats.bySeverity.critical ?? 0} />
              <StatCard label="Yuksek" value={data.securityStats.bySeverity.high ?? 0} />
              <StatCard label="Blok IP" value={data.securityStats.blockedIps} />
            </div>
          )}
          {(data.securityEvents ?? []).length === 0 ? <p className="text-sm text-slate-400">Güvenlik olayı yok.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-white/8">
              <table className="w-full text-xs">
                <thead className="border-b border-white/8 bg-white/4"><tr>{['Tip','IP','Tenant','Aciklama','Onem','Blok','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                <tbody>{(data.securityEvents ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td className="px-4 py-3 text-slate-300">{e.type.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{e.ip ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{e.tenantId?.slice(0,12) ?? '-'}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-slate-300">{e.description}</td>
                    <td className="px-4 py-3">{statusBadge(e.severity, ['low'], ['medium'])}</td>
                    <td className="px-4 py-3">{e.blocked ? <span className="text-rose-300 font-bold">BLOK</span> : <span className="text-slate-500">-</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(e.detectedAt).toLocaleTimeString('tr-TR')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'queues' && (
        <div className="grid gap-4">
          <SectionTitle>Enterprise Queue Metrikleri</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data.queueMetrics ?? []).map((q) => (
              <div key={q.queue} className="rounded-2xl border border-white/8 bg-white/4 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white capitalize">{q.queue}</span>
                  {q.dead > 0 && <button type="button" onClick={async () => { await obsAction('clear_dead_queue', { queue: q.queue }); void refresh(); }} className="rounded-lg bg-rose-500/15 px-2 py-1 text-[10px] font-semibold text-rose-300">DLQ Temizle</button>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                  {[['Bekleyen',q.pending,'text-blue-300'],['Tamamlanan',q.completed,'text-emerald-300'],['Dead',q.dead,'text-rose-300']].map(([l,v,c]) => (
                    <div key={String(l)}><p className={`text-lg font-bold ${String(c)}`}>{v}</p><p className="text-[10px] text-slate-500">{l}</p></div>
                  ))}
                </div>
              </div>
            ))}
            {(data.queueMetrics ?? []).length === 0 && <p className="text-sm text-slate-400">Queue verisi yok.</p>}
          </div>
        </div>
      )}

      {activeTab === 'advisor' && (
        <div className="grid gap-4">
          <SectionTitle>Performans Tavsiyeleri</SectionTitle>
          {(data.advisories ?? []).length === 0 ? <p className="text-sm text-emerald-400">Performans sorunu tespit edilmedi.</p> : (
            <div className="grid gap-3">{(data.advisories ?? []).map((adv) => (
              <div key={adv.id} className={`rounded-2xl border px-5 py-4 ${adv.severity === 'high' ? 'border-rose-500/30 bg-rose-500/5' : adv.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/8 bg-white/4'}`}>
                <div className="flex items-start gap-3">
                  {statusBadge(adv.severity, ['low'], ['medium'])}
                  <div><p className="text-xs font-semibold text-white">{adv.title}</p><p className="mt-1 text-[11px] text-slate-300">{adv.recommendation}</p></div>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {activeTab === 'healing' && (
        <div className="grid gap-4">
          <SectionTitle>Self-Healing Olayları</SectionTitle>
          {data.healingStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Toplam" value={data.healingStats.totalEvents} />
              <StatCard label="Çözüldü" value={data.healingStats.resolved} />
              <StatCard label="Devam" value={data.healingStats.inProgress} />
              <StatCard label="Döngü" value={data.healingStats.runCount} sub="engine cycle" />
            </div>
          )}
          {(data.healingEvents ?? []).length === 0 ? <p className="text-sm text-slate-400">Self-healing olayı yok.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-white/8">
              <table className="w-full text-xs">
                <thead className="border-b border-white/8 bg-white/4"><tr>{['Aksiyon','Tenant','Detay','Durum','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                <tbody>{(data.healingEvents ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td className="px-4 py-3 text-slate-300">{e.action.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 text-slate-400">{e.tenantId?.slice(0,12) ?? '-'}</td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-slate-300">{e.detail}</td>
                    <td className="px-4 py-3">{statusBadge(e.status, ['resolved'], ['in_progress'])}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(e.triggeredAt).toLocaleTimeString('tr-TR')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'resilience' && (
        <div className="grid gap-5">
          {data.operationMode && (
            <div className={`rounded-2xl border px-5 py-4 ${data.operationMode.mode === 'normal' ? 'border-emerald-500/20 bg-emerald-500/5' : data.operationMode.mode === 'degraded' ? 'border-amber-500/20 bg-amber-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Operasyon Modu</p>
                  <div className="mt-1 flex items-center gap-3">
                    {statusBadge(data.operationMode.mode, ['normal'], ['degraded', 'maintenance'])}
                    <span className="text-xs text-slate-300">{data.operationMode.reason}</span>
                    <span className="ml-2 text-[11px] text-slate-500">Puan: {data.operationMode.modeScore}/100</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['normal', 'maintenance', 'degraded'] as const).map((m) => (
                    <button key={m} type="button" onClick={async () => { await obsAction('set_operation_mode', { operationMode: m, operationModeReason: 'Admin override' }); void refresh(); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15 capitalize">{m}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div>
            <SectionTitle>Backup &amp; Recovery Ozeti</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Backup Sagligi" value={(data.backupStats?.backupHealthScore ?? 0) + '/100'} sub={`Toplam: ${data.backupStats?.totalRuns ?? 0} calisma`} />
              <StatCard label="Son Backup" value={data.backupStats?.lastBackupAt ? new Date(data.backupStats.lastBackupAt).toLocaleTimeString('tr-TR') : '-'} sub={`${data.backupStats?.totalBackupSizeMb ?? 0} MB`} />
              <StatCard label="Recovery Skoru" value={(data.recoveryReport?.recoveryReadinessScore ?? 0) + '/100'} sub={`RPO:${data.recoveryReport?.rpoMinutesEstimate ?? '?'}dk RTO:${data.recoveryReport?.rtoMinutesEstimate ?? '?'}dk`} />
              <StatCard label="HA Skoru" value={(data.haReadiness?.score ?? 0) + '/100'} sub={`${data.haReadiness?.cluster.instanceCount ?? 1}/${data.haReadiness?.cluster.targetInstanceCount ?? 2} instance`} />
            </div>
          </div>
          <div>
            <SectionTitle>Backup Aksiyonlari</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={async () => { await obsAction('run_incremental_backup'); void refresh(); }} className="rounded-xl bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/35">Artimli Backup</button>
              <button type="button" onClick={async () => { await obsAction('run_full_backup'); void refresh(); }} className="rounded-xl bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/35">Tam Backup</button>
              <button type="button" onClick={async () => { await obsAction('validate_backups'); void refresh(); }} className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/35">Dogrulama + Simulasyon</button>
              <button type="button" onClick={async () => { await obsAction('full_restore'); void refresh(); }} className="rounded-xl bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25">Tam Geri Yukleme (Sim)</button>
              <button type="button" onClick={async () => { await obsAction('run_postgres_outage_playbook'); void refresh(); }} className="rounded-xl bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25">PG Outage Playbook</button>
              <button type="button" onClick={async () => { await obsAction('run_redis_outage_playbook'); void refresh(); }} className="rounded-xl bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25">Redis Outage Playbook</button>
            </div>
          </div>
          {data.latestValidation && (
            <div>
              <SectionTitle>Son Backup Dogrulama</SectionTitle>
              <div className={`rounded-2xl border px-5 py-4 ${data.latestValidation.status === 'ok' ? 'border-emerald-500/20 bg-emerald-500/5' : data.latestValidation.status === 'warn' ? 'border-amber-500/20 bg-amber-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                <div className="flex items-center gap-3">
                  {statusBadge(data.latestValidation.status, ['ok'], ['warn'])}
                  <span className="text-xs text-slate-300">Kontrol: {data.latestValidation.checkedBackups} backup</span>
                  {data.latestValidation.corruptedBackups.length > 0 && <span className="text-xs text-rose-300 font-bold">{data.latestValidation.corruptedBackups.length} corrupt</span>}
                  <span className="ml-auto text-[11px] text-slate-500">{new Date(data.latestValidation.completedAt).toLocaleTimeString('tr-TR')}</span>
                </div>
                <ul className="mt-2 grid gap-0.5">{data.latestValidation.details.slice(0,6).map((d, i) => <li key={i} className="text-[10px] text-slate-400">{d}</li>)}</ul>
              </div>
            </div>
          )}
          {data.haReadiness && data.haReadiness.risks.length > 0 && (
            <div>
              <SectionTitle>HA Riskleri</SectionTitle>
              <ul className="grid gap-1.5">{data.haReadiness.risks.map((r, i) => <li key={i} className="rounded-xl bg-amber-500/8 px-4 py-2 text-xs text-amber-200">Uyarı: {r}</li>)}</ul>
            </div>
          )}
          {(data.recentRestores ?? []).length > 0 && (
            <div>
              <SectionTitle>Son Geri Yuklemeler</SectionTitle>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['Tip','Durum','Sim','Sure','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                  <tbody>{(data.recentRestores ?? []).slice(0,15).map((r) => (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-slate-300 capitalize">{r.type.replace(/_/g,' ')}</td>
                      <td className="px-4 py-3">{statusBadge(r.status, ['success','simulated'], ['partial'])}</td>
                      <td className="px-4 py-3 text-slate-400">{r.simulated ? 'E' : 'H'}</td>
                      <td className="px-4 py-3 text-slate-300">{r.durationMs}ms</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(r.startedAt).toLocaleTimeString('tr-TR')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {data.recoveryReport && (
            <div>
              <SectionTitle>DR Hazirlik Raporu</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([['Recovery', data.recoveryReport.recoveryReadinessScore+'/100'],['Maturity', data.recoveryReport.backupMaturityScore+'/100'],['HA', data.recoveryReport.haReadinessScore+'/100'],['RPO', data.recoveryReport.rpoMinutesEstimate+'dk'],['RTO', data.recoveryReport.rtoMinutesEstimate+'dk'],['Restore%', data.recoveryReport.restoreSuccessRate+'%']] as [string,string][]).map(([l,v]) => <StatCard key={l} label={l} value={v} />)}
              </div>
            </div>
          )}
          {(data.backupRuns ?? []).length > 0 && (
            <div>
              <SectionTitle>Son Backup Calismalari</SectionTitle>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['Kategori','Mod','Durum','Boyut','Şifreli','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                  <tbody>{(data.backupRuns ?? []).slice(0,20).map((r) => (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-slate-300">{r.category}</td>
                      <td className="px-4 py-3 text-slate-400">{r.mode}</td>
                      <td className="px-4 py-3">{statusBadge(r.status, ['success'], ['skipped'])}</td>
                      <td className="px-4 py-3 text-slate-300">{(r.sizeBytes/1024).toFixed(1)}KB</td>
                      <td className="px-4 py-3">{r.encrypted ? <span className="text-emerald-400 text-[10px]">AES-GCM</span> : <span className="text-slate-500">-</span>}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(r.completedAt).toLocaleTimeString('tr-TR')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="grid gap-4">
          <SectionTitle>Audit Trail</SectionTitle>
          {data.auditStats && (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Toplam" value={data.auditStats.total} />
              <StatCard label="Son 24s" value={data.auditStats.last24h} />
              <StatCard label="Hassas" value={data.auditStats.sensitiveActions} sub="refund/perm/config" />
            </div>
          )}
          {(data.recentAudit ?? []).length === 0 ? <p className="text-sm text-slate-400">Audit kaydi yok.</p> : (
            <div className="overflow-x-auto rounded-2xl border border-white/8">
              <table className="w-full text-xs">
                <thead className="border-b border-white/8 bg-white/4"><tr>{['Kategori','Aksiyon','Aktor','Tenant','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                <tbody>{(data.recentAudit ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td className="px-4 py-3">{statusBadge(e.category, ['auth_event'], ['tenant_config','package_change'])}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{e.action}</td>
                    <td className="px-4 py-3 text-slate-400">{e.actorId.slice(0,16)}</td>
                    <td className="px-4 py-3 text-slate-400">{e.tenantId?.slice(0,12) ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(e.at).toLocaleString('tr-TR')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="grid gap-5">
          {data.slowQueries.length > 0 && (
            <div>
              <SectionTitle>Yavas Sorgular</SectionTitle>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['ms','Sorgu','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                  <tbody>{data.slowQueries.map((q) => (
                    <tr key={q.id} className="border-b border-white/5">
                      <td className="px-4 py-3 font-bold text-amber-300">{q.durationMs}</td>
                      <td className="max-w-[480px] truncate px-4 py-3 font-mono text-slate-300">{q.query}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(q.at).toLocaleTimeString('tr-TR')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {data.logs.length > 0 && (
            <div>
              <SectionTitle>Structured Loglar</SectionTitle>
              <div className="overflow-x-auto rounded-2xl border border-white/8">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['Level','Mesaj','Servis','Tenant','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
                  <tbody>{data.logs.slice(0, 80).map((log) => (
                    <tr key={log.id} className="border-b border-white/5">
                      <td className="px-4 py-3">{statusBadge(log.level, ['info'], ['warn'])}</td>
                      <td className="max-w-[400px] truncate px-4 py-3 text-slate-300">{log.message}</td>
                      <td className="px-4 py-3 text-slate-400">{log.service ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{log.tenantId ? log.tenantId.slice(0,8) + '...' : '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(log.at).toLocaleTimeString('tr-TR')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


