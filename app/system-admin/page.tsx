'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, Building2, CreditCard, FileText, HandCoins, LayoutDashboard, Package, Plus, ReceiptText, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { getDefaultModulesForPackageType, PACKAGE_MODULE_OPTIONS, type PackageModuleKey } from '@/lib/package-access';
import { secureLogout } from '@/lib/client/secure-logout';
import {
  createAdminTenantDraft,
  createEmptyTenantDataStructure,
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

type AdminModule = 'dashboard' | 'tenants' | 'packages' | 'dealers' | 'sales' | 'payments' | 'finance' | 'invoices' | 'reports' | 'monitoring';
type TenantDraft = ReturnType<typeof createAdminTenantDraft>;

const modules: Array<{ id: AdminModule; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tenants', label: 'Aboneler', icon: Building2 },
  { id: 'packages', label: 'Paketler', icon: Package },
  { id: 'dealers', label: 'Bayi / Temsilci', icon: HandCoins },
  { id: 'sales', label: 'Sat─▒┼ş Takibi', icon: Users },
  { id: 'payments', label: '├ûdeme / Yenileme', icon: RefreshCw },
  { id: 'finance', label: 'Finans', icon: CreditCard },
  { id: 'invoices', label: 'Faturalar', icon: FileText },
  { id: 'reports', label: 'Raporlar', icon: BarChart3 },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(startDate: string, days: number) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
      setError('Admin kullan─▒c─▒ ad─▒ veya ┼şifre hatal─▒.');
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
            <p className="mt-1 text-sm text-slate-300">Sat─▒┼ş, fatura ve abonelik kontrol paneli.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          <input value={adminUser} onChange={(event) => setAdminUser(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" />
          <input type="password" value={adminPass} onChange={(event) => setAdminPass(event.target.value)} placeholder="admin123" className="h-12 rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" />
        </div>
        {error ? <p className="mt-3 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p> : null}
        <button type="button" onClick={() => void login()} className="mt-5 h-12 w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60" disabled={loading}>{loading ? 'Giriş yapılıyor…' : 'Giri┼ş yap'}</button>
      </section>
    </main>
  );
}

export default function SystemAdminPage() {
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeModule, setActiveModule] = useState<AdminModule>('dashboard');
  const [state, setState] = useState<SystemAdminState>(() => loadSystemAdminState());
  const [tenantDraft, setTenantDraft] = useState<TenantDraft>(() => createAdminTenantDraft());
  const [dealerDraft, setDealerDraft] = useState<Omit<AdminDealer, 'id'>>({ name: '', type: 'dealer', commission_rate: 20, phone: '', email: '', active: true });
  const [packageDraft, setPackageDraft] = useState<AdminPackage>(() => createPackageDraft());
  const [financeDraft, setFinanceDraft] = useState<Omit<AdminFinanceTransaction, 'id'>>({ type: 'income', source: 'Abonelik tahsilat─▒', tenant_id: '', amount: 0, date: today(), note: '' });
  const [invoiceDraft, setInvoiceDraft] = useState<Omit<AdminInvoice, 'id' | 'invoice_no'>>({ tenant_id: '', type: 'subscription', amount: 0, status: 'draft', issue_date: today(), due_date: today() });
  const [saleDraft, setSaleDraft] = useState<Omit<AdminSale, 'id' | 'commission_amount' | 'commission_status'>>({ tenant_id: '', package_id: 'pkg-mini', seller: 'Merkez Sat─▒┼ş', dealer_id: 'dealer-center', amount: 0, commission_rate: 0, date: today() });
  const [paymentDraft, setPaymentDraft] = useState<Omit<AdminPayment, 'id' | 'status' | 'transaction_id' | 'date'>>({ tenant_id: '', invoice_id: '', amount: 0, provider: 'manual' });

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      const payload = response && response.ok ? await response.json().catch(() => null) : null;
      if (!mounted) return;
      if (payload?.ok && payload?.session?.role === 'super_admin') {
        setAdminLoggedIn(true);
      }
      setState(loadSystemAdminState());
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
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

  function saveTenant() {
    const pkg = selectedPackage(tenantDraft.package_id);
    if (!tenantDraft.company_name.trim() || !tenantDraft.admin_username.trim() || !tenantDraft.admin_password.trim()) return;
    const tenant: AdminTenant = {
      id: `tenant-${Date.now()}`,
      tenant_id: tenantDraft.tenant_id,
      company_name: tenantDraft.company_name.trim(),
      package_id: pkg.id,
      package_type: pkg.package_type,
      start_date: tenantDraft.start_date,
      end_date: tenantDraft.end_date || addDays(tenantDraft.start_date, pkg.duration_days),
      status: tenantDraft.demo_enabled ? 'demo' : tenantDraft.status,
      demo_enabled: tenantDraft.demo_enabled,
      auto_renew: tenantDraft.auto_renew,
      admin_username: tenantDraft.admin_username.trim(),
      admin_password: tenantDraft.admin_password.trim(),
      dealer_id: tenantDraft.dealer_id || undefined,
      created_at: new Date().toISOString(),
    };
    createEmptyTenantDataStructure(tenant.tenant_id);
    commit({ ...state, tenants: [tenant, ...state.tenants] });
    setTenantDraft(createAdminTenantDraft());
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
    setSaleDraft({ tenant_id: '', package_id: 'pkg-mini', seller: 'Merkez Sat─▒┼ş', dealer_id: 'dealer-center', amount: 0, commission_rate: 0, date: today() });
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
      error: success ? undefined : '├ûdeme sa─şlay─▒c─▒ ba┼şar─▒s─▒z yan─▒t d├Ând├╝rd├╝.',
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
        finance: [{ id: `fin-${Date.now()}`, type: 'income', source: 'Online ├Âdeme', tenant_id: payment.tenant_id, amount: payment.amount, date: today(), note: payment.transaction_id }, ...state.finance],
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
    setFinanceDraft({ type: 'income', source: 'Abonelik tahsilat─▒', tenant_id: '', amount: 0, date: today(), note: '' });
  }

  function addInvoice() {
    if (!invoiceDraft.tenant_id || invoiceDraft.amount <= 0) return;
    commit({ ...state, invoices: [{ id: `inv-${Date.now()}`, invoice_no: nextInvoiceNo(state.invoices), ...invoiceDraft }, ...state.invoices] });
    setInvoiceDraft({ tenant_id: '', type: 'subscription', amount: 0, status: 'draft', issue_date: today(), due_date: today() });
  }

  if (!adminLoggedIn) return <LoginCard onLogin={() => setAdminLoggedIn(true)} />;

  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-[#111827] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">System Admin</p>
          <h1 className="mt-2 text-2xl font-semibold">SaaS ERP</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Sat─▒┼ş, fatura, bayi ve abonelik sistemi.</p>
          <nav className="mt-8 grid gap-2">
            {modules.map((module) => {
              const Icon = module.icon;
              const active = activeModule === module.id;
              return (
                <button key={module.id} type="button" onClick={() => setActiveModule(module.id)} className={`flex h-12 items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold transition ${active ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  <Icon className="h-4.5 w-4.5" />
                  {module.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 p-6">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Kontrol paneli</p>
              <h2 className="mt-2 text-3xl font-semibold">{modules.find((item) => item.id === activeModule)?.label}</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
                Tenant verisi ayr─▒, system-admin gelir verisi ayr─▒ saklan─▒r.
              </div>
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

          {activeModule === 'dashboard' ? <Dashboard dashboard={dashboard} state={state} /> : null}
          {activeModule === 'tenants' ? <TenantsModule state={state} tenantDraft={tenantDraft} setTenantDraft={setTenantDraft} selectedPackage={selectedPackage} saveTenant={saveTenant} commit={commit} /> : null}
          {activeModule === 'packages' ? <PackagesModule state={state} packageDraft={packageDraft} setPackageDraft={setPackageDraft} savePackage={savePackage} editPackage={editPackage} resetPackageDraft={resetPackageDraft} deletePackage={deletePackage} /> : null}
          {activeModule === 'dealers' ? <DealersModule state={state} dealerDraft={dealerDraft} setDealerDraft={setDealerDraft} saveDealer={saveDealer} commit={commit} /> : null}
          {activeModule === 'sales' ? <SalesModule state={state} saleDraft={saleDraft} setSaleDraft={setSaleDraft} addSale={addSale} /> : null}
          {activeModule === 'payments' ? <PaymentsModule state={state} paymentDraft={paymentDraft} setPaymentDraft={setPaymentDraft} processPayment={processPayment} /> : null}
          {activeModule === 'finance' ? <FinanceModule state={state} financeDraft={financeDraft} setFinanceDraft={setFinanceDraft} addFinanceTransaction={addFinanceTransaction} /> : null}
          {activeModule === 'invoices' ? <InvoiceModule state={state} invoiceDraft={invoiceDraft} setInvoiceDraft={setInvoiceDraft} addInvoice={addInvoice} /> : null}
          {activeModule === 'reports' ? <ReportsModule state={state} dashboard={dashboard} /> : null}
          {activeModule === 'monitoring' ? <MonitoringModule /> : null}
        </section>
      </div>
    </main>
  );
}

function Dashboard({ dashboard, state }: { dashboard: any; state: SystemAdminState }) {
  return (
    <div className="mt-6 grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Toplam gelir', formatAdminMoney(dashboard.revenue)],
          ['Aktif abonelik', dashboard.activeSubscriptions],
          ['Komisyon', formatAdminMoney(dashboard.commissions)],
          ['Bekleyen ├Âdeme', formatAdminMoney(dashboard.pendingPayments)],
          ['Bekleyen hak edi┼ş', formatAdminMoney(dashboard.pendingCommissions)],
        ].map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}
      </div>
      <DataTable headers={['Abone', 'Biti┼ş', 'Yenileme', 'Uyar─▒']} rows={state.tenants.map((tenant) => [tenant.company_name, tenant.end_date, tenant.auto_renew ? 'Otomatik' : 'Manuel', createRenewalNotice(tenant)])} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
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

function TenantsModule({ state, tenantDraft, setTenantDraft, selectedPackage, saveTenant, commit }: any) {
  const [selectedTenantId, setSelectedTenantId] = useState<string>(state.tenants[0]?.tenant_id ?? '');
  const [editDraft, setEditDraft] = useState<AdminTenant | null>(null);
  const [editSaved, setEditSaved] = useState(false);

  useEffect(() => {
    if (!state.tenants.some((tenant: AdminTenant) => tenant.tenant_id === selectedTenantId)) {
      setSelectedTenantId(state.tenants[0]?.tenant_id ?? '');
    }
  }, [selectedTenantId, state.tenants]);

  const selectedTenant = state.tenants.find((tenant: AdminTenant) => tenant.tenant_id === selectedTenantId) ?? null;

  useEffect(() => {
    setEditDraft(selectedTenant ? { ...selectedTenant } : null);
    setEditSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  function saveEditDraft() {
    if (!editDraft) return;
    const pkg = state.packages.find((item: AdminPackage) => item.id === editDraft.package_id);
    const updated = state.tenants.map((t: AdminTenant) => t.tenant_id === editDraft.tenant_id ? { ...editDraft, package_type: pkg?.package_type ?? editDraft.package_type } : t);
    commit({ ...state, tenants: updated });
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  }

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Yeni abone olu┼ştur</h3>
        <div className="mt-5 grid gap-3">
          <input value={tenantDraft.tenant_id} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, tenant_id: e.target.value }))} className="input-dark" />
          <input value={tenantDraft.company_name} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, company_name: e.target.value }))} placeholder="Firma ad─▒" className="input-dark" />
          <select value={tenantDraft.package_id} onChange={(e) => { const pkg = selectedPackage(e.target.value); setTenantDraft((c: TenantDraft) => ({ ...c, package_id: pkg.id, end_date: addDays(c.start_date, pkg.duration_days) })); }} className="input-dark">
            {state.packages.map((pkg: AdminPackage) => <option key={pkg.id} value={pkg.id}>{pkg.name} - {formatAdminMoney(pkg.price)}</option>)}
          </select>
          <select value={tenantDraft.dealer_id} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, dealer_id: e.target.value }))} className="input-dark">
            <option value="">Bayi / temsilci yok</option>
            {state.dealers.map((dealer: AdminDealer) => <option key={dealer.id} value={dealer.id}>{dealer.name}</option>)}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="date" value={tenantDraft.start_date} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, start_date: e.target.value }))} className="input-dark" />
            <input type="date" value={tenantDraft.end_date} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, end_date: e.target.value }))} className="input-dark" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={tenantDraft.admin_username} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, admin_username: e.target.value }))} placeholder="─░lk kullan─▒c─▒ ad─▒" className="input-dark" />
            <input type="password" value={tenantDraft.admin_password} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, admin_password: e.target.value }))} placeholder="─░lk ┼şifre" className="input-dark" />
          </div>
          <label className="check-row">Otomatik yenileme <input type="checkbox" checked={tenantDraft.auto_renew} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, auto_renew: e.target.checked }))} /></label>
          <label className="check-row">Demo abonelik <input type="checkbox" checked={tenantDraft.demo_enabled} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, demo_enabled: e.target.checked }))} /></label>
        </div>
        <button type="button" onClick={saveTenant} className="btn-green"><Plus className="h-4 w-4" /> Abone olu┼ştur</button>
        <p className="mt-3 text-xs leading-5 text-slate-400">Yeni abone i├ğin bo┼ş tenant veri alan─▒ a├ğ─▒l─▒r. Varsay─▒lan ├╝r├╝n veya m├╝┼şteri eklenmez.</p>
      </article>
      <div className="grid gap-4">
        <DataTable headers={['Firma', 'Kullan─▒c─▒', 'Paket', 'Bayi', 'Tarih', 'Yenileme', '']} rows={state.tenants.map((tenant: AdminTenant) => [
        <button key="firm" type="button" onClick={() => setSelectedTenantId(tenant.tenant_id)} className={`w-full rounded-xl px-3 py-2 text-left transition ${selectedTenantId === tenant.tenant_id ? 'bg-blue-600/20 ring-1 ring-blue-400/40' : 'bg-white/0 hover:bg-white/5'}`}><p className="font-semibold">{tenant.company_name}</p><p className="text-xs text-slate-400">{tenant.tenant_id}</p></button>,
        tenant.admin_username,
        selectedPackage(tenant.package_id)?.name ?? tenant.package_type,
        state.dealers.find((dealer: AdminDealer) => dealer.id === tenant.dealer_id)?.name ?? '-',
        `${tenant.start_date} / ${tenant.end_date}`,
        tenant.auto_renew ? 'Otomatik' : 'Manuel',
        <button key="delete" type="button" onClick={() => commit({ ...state, tenants: state.tenants.filter((item: AdminTenant) => item.tenant_id !== tenant.tenant_id) })} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold"><Trash2 className="h-3.5 w-3.5" /></button>,
      ])} />

        {editDraft ? (
          <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Abone d├╝zenle</p>
                <h3 className="mt-2 text-2xl font-semibold">{editDraft.company_name || editDraft.tenant_id}</h3>
              </div>
              <button type="button" onClick={saveEditDraft} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${editSaved ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-500'}`}>
                {editSaved ? 'Ô£ô Kaydedildi' : 'Kaydet'}
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Firma ad─▒</span>
                <input value={editDraft.company_name} onChange={(e) => setEditDraft((c) => c ? { ...c, company_name: e.target.value } : c)} className="input-dark" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Kullan─▒c─▒ ad─▒</span>
                  <input value={editDraft.admin_username} onChange={(e) => setEditDraft((c) => c ? { ...c, admin_username: e.target.value } : c)} className="input-dark" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">┼Şifre</span>
                  <input type="password" value={editDraft.admin_password} onChange={(e) => setEditDraft((c) => c ? { ...c, admin_password: e.target.value } : c)} placeholder="ÔÇóÔÇóÔÇóÔÇóÔÇóÔÇóÔÇóÔÇó" className="input-dark" />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Paket</span>
                <select value={editDraft.package_id} onChange={(e) => setEditDraft((c) => c ? { ...c, package_id: e.target.value } : c)} className="input-dark">
                  {state.packages.map((pkg: AdminPackage) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Bayi / Temsilci</span>
                <select value={editDraft.dealer_id} onChange={(e) => setEditDraft((c) => c ? { ...c, dealer_id: e.target.value } : c)} className="input-dark">
                  <option value="">Bayi / temsilci yok</option>
                  {state.dealers.map((dealer: AdminDealer) => <option key={dealer.id} value={dealer.id}>{dealer.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Durum</span>
                <select value={editDraft.status} onChange={(e) => setEditDraft((c) => c ? { ...c, status: e.target.value as AdminTenant['status'] } : c)} className="input-dark">
                  <option value="active">Aktif</option>
                  <option value="suspended">Ask─▒ya al─▒nd─▒</option>
                  <option value="cancelled">─░ptal edildi</option>
                  <option value="trial">Deneme</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Ba┼şlang─▒├ğ</span>
                  <input type="date" value={editDraft.start_date} onChange={(e) => setEditDraft((c) => c ? { ...c, start_date: e.target.value } : c)} className="input-dark" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Biti┼ş</span>
                  <input type="date" value={editDraft.end_date} onChange={(e) => setEditDraft((c) => c ? { ...c, end_date: e.target.value } : c)} className="input-dark" />
                </label>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="check-row">Otomatik yenileme <input type="checkbox" checked={editDraft.auto_renew} onChange={(e) => setEditDraft((c) => c ? { ...c, auto_renew: e.target.checked } : c)} /></label>
                <label className="check-row">Demo abonelik <input type="checkbox" checked={editDraft.demo_enabled} onChange={(e) => setEditDraft((c) => c ? { ...c, demo_enabled: e.target.checked } : c)} /></label>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Abone No</p>
                <p className="mt-1 text-sm font-semibold text-slate-300">{editDraft.tenant_id}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Olu┼şturulma</p>
                <p className="mt-1 text-sm font-semibold text-slate-300">{new Date(editDraft.created_at).toLocaleString('tr-TR')}</p>
              </div>
            </div>
          </article>
        ) : null}
      </div>
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
          <h3 className="text-xl font-semibold">{isEditing ? 'Paket d├╝zenle' : 'Paket olu┼ştur'}</h3>
          {isEditing ? <button type="button" onClick={resetPackageDraft} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100">Yeni paket</button> : null}
        </div>
        <div className="mt-5 grid gap-3">
          <input value={packageDraft.name} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, name: e.target.value }))} placeholder="Paket ad─▒" className="input-dark" />
          <select value={packageDraft.package_type} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, package_type: e.target.value as PackageType, modules: getDefaultModulesForPackageType(e.target.value as PackageType) }))} className="input-dark"><option value="mini">Mini</option><option value="gold">Gold</option><option value="premium">Premium</option></select>
          <input type="number" value={packageDraft.price} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, price: Number(e.target.value) }))} placeholder="Ayl─▒k fiyat" className="input-dark" />
          <input type="number" value={packageDraft.duration_days} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, duration_days: Number(e.target.value) }))} placeholder="S├╝re / g├╝n" className="input-dark" />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pakete dahil mod├╝ller</p>
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
          <textarea value={packageDraft.features.join('\n')} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, features: e.target.value.split(/\r?\n/).filter(Boolean) }))} placeholder="├ûzellikler" className="input-dark min-h-28 py-3" />
        </div>
        <button type="button" onClick={savePackage} className="btn-blue">{isEditing ? 'De─şi┼şiklikleri kaydet' : 'Paketi kaydet'}</button>
      </article>
      <div className="grid gap-4 md:grid-cols-3">{state.packages.map((pkg: AdminPackage) => {
        const usageCount = state.tenants.filter((tenant: AdminTenant) => tenant.package_id === pkg.id).length;
        return <article key={pkg.id} className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">{pkg.package_type}</p><h3 className="mt-2 text-2xl font-semibold">{pkg.name}</h3><p className="mt-2 text-sm text-slate-400">Paket fiyat─▒</p><p className="mt-1 text-3xl font-semibold">{formatAdminMoney(pkg.price)}</p><p className="mt-1 text-sm text-slate-400">{pkg.duration_days} g├╝n</p><div className="mt-3 text-xs font-semibold text-slate-400">Ba─şl─▒ abone: {usageCount}</div><div className="mt-4 flex flex-wrap gap-2">{pkg.modules.map((module) => <span key={module} className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-100">{PACKAGE_MODULE_OPTIONS.find((item) => item.key === module)?.label ?? module}</span>)}</div><div className="mt-4 space-y-2">{pkg.features.map((f) => <p key={f} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">{f}</p>)}</div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => editPackage(pkg)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">D├╝zenle</button><button type="button" onClick={() => deletePackage(pkg.id)} disabled={usageCount > 0} className={`rounded-xl px-3 py-2 text-xs font-semibold text-white ${usageCount > 0 ? 'bg-slate-700/60 cursor-not-allowed' : 'bg-rose-600'}`}>Sil</button></div>{usageCount > 0 ? <p className="mt-2 text-xs text-amber-200">Bu paket kullan─▒mda oldu─şu i├ğin silinemez.</p> : null}</article>;
      })}</div>
    </div>
  );
}

function DealersModule({ state, dealerDraft, setDealerDraft, saveDealer, commit }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Bayi / temsilci olu┼ştur</h3>
        <div className="mt-5 grid gap-3">
          <input value={dealerDraft.name} onChange={(e) => setDealerDraft((c: any) => ({ ...c, name: e.target.value }))} placeholder="Ad / firma" className="input-dark" />
          <select value={dealerDraft.type} onChange={(e) => setDealerDraft((c: any) => ({ ...c, type: e.target.value }))} className="input-dark"><option value="dealer">Bayi</option><option value="representative">Sat─▒┼ş temsilcisi</option></select>
          <input type="number" value={dealerDraft.commission_rate} onChange={(e) => setDealerDraft((c: any) => ({ ...c, commission_rate: Number(e.target.value) }))} placeholder="Komisyon %" className="input-dark" />
          <input value={dealerDraft.phone} onChange={(e) => setDealerDraft((c: any) => ({ ...c, phone: e.target.value }))} placeholder="Telefon" className="input-dark" />
          <input value={dealerDraft.email} onChange={(e) => setDealerDraft((c: any) => ({ ...c, email: e.target.value }))} placeholder="E-posta" className="input-dark" />
        </div>
        <button type="button" onClick={saveDealer} className="btn-blue">Kaydet</button>
      </article>
      <DataTable headers={['Ad', 'Tip', 'Komisyon', 'Bekleyen hak edi┼ş', 'Durum']} rows={state.dealers.map((dealer: AdminDealer) => {
        const pending = state.commissions.filter((item: any) => item.dealer_id === dealer.id && item.status === 'pending').reduce((sum: number, item: any) => sum + item.amount, 0);
        return [dealer.name, dealer.type === 'dealer' ? 'Bayi' : 'Temsilci', `%${dealer.commission_rate}`, formatAdminMoney(pending), dealer.active ? 'Aktif' : 'Pasif'];
      })} />
      <DataTable headers={['Sat─▒┼ş', 'Bayi', 'Abone', 'Hak edi┼ş', 'Durum']} rows={state.commissions.map((item: any) => [
        item.sale_id,
        state.dealers.find((dealer: AdminDealer) => dealer.id === item.dealer_id)?.name ?? '-',
        item.tenant_id,
        formatAdminMoney(item.amount),
        <button key={item.id} type="button" onClick={() => commit({ ...state, commissions: state.commissions.map((com: any) => com.id === item.id ? { ...com, status: 'paid', paid_at: today() } : com), sales: state.sales.map((sale: AdminSale) => sale.id === item.sale_id ? { ...sale, commission_status: 'paid' } : sale) })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold">{item.status === 'paid' ? '├ûdendi' : '├ûde'}</button>,
      ])} />
    </div>
  );
}

function SalesModule({ state, saleDraft, setSaleDraft, addSale }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">Sat─▒┼ş kayd─▒</h3>
        <div className="mt-5 grid gap-3">
          <SelectTenant state={state} value={saleDraft.tenant_id} onChange={(value) => setSaleDraft((c: any) => ({ ...c, tenant_id: value }))} />
          <select value={saleDraft.package_id} onChange={(e) => setSaleDraft((c: any) => ({ ...c, package_id: e.target.value, amount: state.packages.find((pkg: AdminPackage) => pkg.id === e.target.value)?.price ?? c.amount }))} className="input-dark">{state.packages.map((pkg: AdminPackage) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select>
          <select value={saleDraft.dealer_id} onChange={(e) => { const dealer = state.dealers.find((d: AdminDealer) => d.id === e.target.value); setSaleDraft((c: any) => ({ ...c, dealer_id: e.target.value, seller: dealer?.name ?? c.seller, commission_rate: dealer?.commission_rate ?? 0 })); }} className="input-dark">{state.dealers.map((dealer: AdminDealer) => <option key={dealer.id} value={dealer.id}>{dealer.name}</option>)}</select>
          <input type="number" value={saleDraft.amount} onChange={(e) => setSaleDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" />
          <input type="number" value={saleDraft.commission_rate} onChange={(e) => setSaleDraft((c: any) => ({ ...c, commission_rate: Number(e.target.value) }))} placeholder="Komisyon %" className="input-dark" />
          <input type="date" value={saleDraft.date} onChange={(e) => setSaleDraft((c: any) => ({ ...c, date: e.target.value }))} className="input-dark" />
        </div>
        <button type="button" onClick={addSale} className="btn-violet">Sat─▒┼ş ekle ve komisyon olu┼ştur</button>
      </article>
      <DataTable headers={['Abone', 'Paket', 'Sat─▒┼ş├ğ─▒', 'Tutar', 'Komisyon', 'Durum']} rows={state.sales.map((item: AdminSale) => [item.tenant_id, item.package_id, item.seller, formatAdminMoney(item.amount), formatAdminMoney(item.commission_amount), item.commission_status])} />
    </div>
  );
}

function PaymentsModule({ state, paymentDraft, setPaymentDraft, processPayment }: any) {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5">
        <h3 className="text-xl font-semibold">├ûdeme ve yenileme</h3>
        <div className="mt-5 grid gap-3">
          <SelectTenant state={state} value={paymentDraft.tenant_id} onChange={(value) => {
            const tenant = state.tenants.find((item: AdminTenant) => item.tenant_id === value);
            const pkg = state.packages.find((item: AdminPackage) => item.id === tenant?.package_id);
            setPaymentDraft((c: any) => ({ ...c, tenant_id: value, amount: pkg?.price ?? c.amount }));
          }} />
          <select value={paymentDraft.invoice_id ?? ''} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, invoice_id: e.target.value }))} className="input-dark"><option value="">Fatura se├ğme</option>{state.invoices.map((inv: AdminInvoice) => <option key={inv.id} value={inv.id}>{inv.invoice_no} - {formatAdminMoney(inv.amount)}</option>)}</select>
          <select value={paymentDraft.provider} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, provider: e.target.value }))} className="input-dark"><option value="manual">Manuel</option><option value="iyzico">Iyzico</option><option value="paytr">PayTR</option></select>
          <input type="number" value={paymentDraft.amount} onChange={(e) => setPaymentDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => processPayment(true)} className="btn-green">Ba┼şar─▒l─▒ ├Âdeme</button>
          <button type="button" onClick={() => processPayment(false)} className="h-12 rounded-2xl bg-rose-600 text-sm font-semibold">Ba┼şar─▒s─▒z ├Âdeme</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Ba┼şar─▒l─▒ ├Âdeme aboneli─şi otomatik uzat─▒r, fatura ve gelir kayd─▒ olu┼şturur.</p>
      </article>
      <DataTable headers={['Abone', 'Sa─şlay─▒c─▒', 'Tutar', 'Durum', '─░┼şlem No']} rows={state.payments.map((item: AdminPayment) => [item.tenant_id, item.provider, formatAdminMoney(item.amount), item.status, item.transaction_id])} />
      <DataTable headers={['Abone', 'Eski biti┼ş', 'Yeni biti┼ş', 'Durum']} rows={state.renewals.map((item: any) => [item.tenant_id, item.old_end_date, item.new_end_date, item.status])} />
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
      <article className="rounded-[1.5rem] border border-white/10 bg-slate-900 p-5"><h3 className="text-xl font-semibold">Fatura olu┼ştur</h3><div className="mt-5 grid gap-3"><SelectTenant state={state} value={invoiceDraft.tenant_id} onChange={(value) => setInvoiceDraft((c: any) => ({ ...c, tenant_id: value }))} /><select value={invoiceDraft.type} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, type: e.target.value }))} className="input-dark"><option value="subscription">Abonelik</option><option value="payment">Tahsilat</option></select><input type="number" value={invoiceDraft.amount} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, amount: Number(e.target.value) }))} placeholder="Tutar" className="input-dark" /><select value={invoiceDraft.status} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, status: e.target.value }))} className="input-dark"><option value="draft">Taslak</option><option value="issued">Kesildi</option><option value="paid">├ûdendi</option><option value="cancelled">─░ptal</option></select><input type="date" value={invoiceDraft.issue_date} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, issue_date: e.target.value }))} className="input-dark" /><input type="date" value={invoiceDraft.due_date} onChange={(e) => setInvoiceDraft((c: any) => ({ ...c, due_date: e.target.value }))} className="input-dark" /></div><button type="button" onClick={addInvoice} className="btn-blue">Fatura ekle</button></article>
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
      <div className="grid gap-4 md:grid-cols-3"><Metric label="Net k├ór" value={formatAdminMoney(dashboard.net)} /><Metric label="A├ğ─▒k fatura" value={formatAdminMoney(dashboard.unpaidInvoices)} /><Metric label="Bekleyen hak edi┼ş" value={formatAdminMoney(dashboard.pendingCommissions)} /></div>
      <DataTable headers={['Bayi / temsilci', 'Tip', 'Sat─▒┼ş adedi', 'Sat─▒┼ş tutar─▒', 'Hak edi┼ş']} rows={dealerRows} />
    </div>
  );
}

function SelectTenant({ state, value, onChange, allowEmpty = false }: { state: SystemAdminState; value: string; onChange: (value: string) => void; allowEmpty?: boolean }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="input-dark">{allowEmpty ? <option value="">Tenant yok / genel</option> : <option value="">Abone sec</option>}{state.tenants.map((tenant) => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.company_name}</option>)}</select>;
}

// ─── Monitoring Module ──────────────────────────────────────────────────────

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
    { id: 'security', label: 'Guvenlik', badge: (data.securityStats?.bySeverity.critical ?? 0) + (data.securityStats?.bySeverity.high ?? 0) || undefined },
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
        <StatCard label="Guvenlik (24h)" value={data.securityStats?.last24h ?? 0} sub={(data.securityStats?.blockedIps ?? 0) + ' IP blok'} />
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
                        <p className="mt-1 text-xs text-slate-300">Print retry {restaurant.metrics.printRetries ?? 0} · WS reconnect {restaurant.metrics.websocketReconnects ?? 0} · Offline {restaurant.metrics.offlineDurationSec ?? 0}s</p>
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
          <SectionTitle>Guvenlik Olaylari</SectionTitle>
          {data.securityStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Toplam (24h)" value={data.securityStats.last24h} />
              <StatCard label="Kritik" value={data.securityStats.bySeverity.critical ?? 0} />
              <StatCard label="Yuksek" value={data.securityStats.bySeverity.high ?? 0} />
              <StatCard label="Blok IP" value={data.securityStats.blockedIps} />
            </div>
          )}
          {(data.securityEvents ?? []).length === 0 ? <p className="text-sm text-slate-400">Guvenlik olayi yok.</p> : (
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
          <SectionTitle>Self-Healing Olaylari</SectionTitle>
          {data.healingStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Toplam" value={data.healingStats.totalEvents} />
              <StatCard label="Cozuldu" value={data.healingStats.resolved} />
              <StatCard label="Devam" value={data.healingStats.inProgress} />
              <StatCard label="Dongu" value={data.healingStats.runCount} sub="engine cycle" />
            </div>
          )}
          {(data.healingEvents ?? []).length === 0 ? <p className="text-sm text-slate-400">Self-healing olayi yok.</p> : (
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
              <ul className="grid gap-1.5">{data.haReadiness.risks.map((r, i) => <li key={i} className="rounded-xl bg-amber-500/8 px-4 py-2 text-xs text-amber-200">⚠ {r}</li>)}</ul>
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
                  <thead className="border-b border-white/8 bg-white/4"><tr>{['Kategori','Mod','Durum','Boyut','Sifreli','Zaman'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-400">{h}</th>)}</tr></thead>
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
