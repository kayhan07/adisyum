'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Building2, CreditCard, FileText, HandCoins, LayoutDashboard, Package, Plus, ReceiptText, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { getDefaultModulesForPackageType, PACKAGE_MODULE_OPTIONS, type PackageModuleKey } from '@/lib/package-access';
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

type AdminModule = 'dashboard' | 'tenants' | 'packages' | 'dealers' | 'sales' | 'payments' | 'finance' | 'invoices' | 'reports';
type TenantDraft = ReturnType<typeof createAdminTenantDraft>;

const modules: Array<{ id: AdminModule; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tenants', label: 'Aboneler', icon: Building2 },
  { id: 'packages', label: 'Paketler', icon: Package },
  { id: 'dealers', label: 'Bayi / Temsilci', icon: HandCoins },
  { id: 'sales', label: 'Satış Takibi', icon: Users },
  { id: 'payments', label: 'Ödeme / Yenileme', icon: RefreshCw },
  { id: 'finance', label: 'Finans', icon: CreditCard },
  { id: 'invoices', label: 'Faturalar', icon: FileText },
  { id: 'reports', label: 'Raporlar', icon: BarChart3 },
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

  function login() {
    if (adminUser.trim().toLocaleLowerCase('tr-TR') === 'admin' && (adminPass === 'admin123' || adminPass === '1234')) {
      window.localStorage.setItem('adisyon-system-admin-auth', 'true');
      document.cookie = 'adisyon_admin_token=local-admin; path=/; max-age=2592000; SameSite=Lax';
      onLogin();
      return;
    }
    setError('Admin kullanıcı adı veya şifre hatalı.');
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
        <button type="button" onClick={login} className="mt-5 h-12 w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white">Giriş yap</button>
      </section>
    </main>
  );
}

export default function SystemAdminPage() {
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [activeModule, setActiveModule] = useState<AdminModule>('dashboard');
  const [state, setState] = useState<SystemAdminState>(() => loadSystemAdminState());
  const [tenantDraft, setTenantDraft] = useState<TenantDraft>(() => createAdminTenantDraft());
  const [dealerDraft, setDealerDraft] = useState<Omit<AdminDealer, 'id'>>({ name: '', type: 'dealer', commission_rate: 20, phone: '', email: '', active: true });
  const [packageDraft, setPackageDraft] = useState<AdminPackage>(() => createPackageDraft());
  const [financeDraft, setFinanceDraft] = useState<Omit<AdminFinanceTransaction, 'id'>>({ type: 'income', source: 'Abonelik tahsilatı', tenant_id: '', amount: 0, date: today(), note: '' });
  const [invoiceDraft, setInvoiceDraft] = useState<Omit<AdminInvoice, 'id' | 'invoice_no'>>({ tenant_id: '', type: 'subscription', amount: 0, status: 'draft', issue_date: today(), due_date: today() });
  const [saleDraft, setSaleDraft] = useState<Omit<AdminSale, 'id' | 'commission_amount' | 'commission_status'>>({ tenant_id: '', package_id: 'pkg-mini', seller: 'Merkez Satış', dealer_id: 'dealer-center', amount: 0, commission_rate: 0, date: today() });
  const [paymentDraft, setPaymentDraft] = useState<Omit<AdminPayment, 'id' | 'status' | 'transaction_id' | 'date'>>({ tenant_id: '', invoice_id: '', amount: 0, provider: 'manual' });

  useEffect(() => {
    if (window.localStorage.getItem('adisyon-system-admin-auth') === 'true') setAdminLoggedIn(true);
    setState(loadSystemAdminState());
  }, []);

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

  if (!adminLoggedIn) return <LoginCard onLogin={() => setAdminLoggedIn(true)} />;

  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-[#111827] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">System Admin</p>
          <h1 className="mt-2 text-2xl font-semibold">SaaS ERP</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Satış, fatura, bayi ve abonelik sistemi.</p>
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
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
              Tenant verisi ayrı, system-admin gelir verisi ayrı saklanır.
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
          ['Bekleyen ödeme', formatAdminMoney(dashboard.pendingPayments)],
          ['Bekleyen hak ediş', formatAdminMoney(dashboard.pendingCommissions)],
        ].map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}
      </div>
      <DataTable headers={['Abone', 'Bitiş', 'Yenileme', 'Uyarı']} rows={state.tenants.map((tenant) => [tenant.company_name, tenant.end_date, tenant.auto_renew ? 'Otomatik' : 'Manuel', createRenewalNotice(tenant)])} />
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
        <h3 className="text-xl font-semibold">Yeni abone oluştur</h3>
        <div className="mt-5 grid gap-3">
          <input value={tenantDraft.tenant_id} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, tenant_id: e.target.value }))} className="input-dark" />
          <input value={tenantDraft.company_name} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, company_name: e.target.value }))} placeholder="Firma adı" className="input-dark" />
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
            <input value={tenantDraft.admin_username} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, admin_username: e.target.value }))} placeholder="İlk kullanıcı adı" className="input-dark" />
            <input type="password" value={tenantDraft.admin_password} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, admin_password: e.target.value }))} placeholder="İlk şifre" className="input-dark" />
          </div>
          <label className="check-row">Otomatik yenileme <input type="checkbox" checked={tenantDraft.auto_renew} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, auto_renew: e.target.checked }))} /></label>
          <label className="check-row">Demo abonelik <input type="checkbox" checked={tenantDraft.demo_enabled} onChange={(e) => setTenantDraft((c: TenantDraft) => ({ ...c, demo_enabled: e.target.checked }))} /></label>
        </div>
        <button type="button" onClick={saveTenant} className="btn-green"><Plus className="h-4 w-4" /> Abone oluştur</button>
        <p className="mt-3 text-xs leading-5 text-slate-400">Yeni abone için boş tenant veri alanı açılır. Varsayılan ürün veya müşteri eklenmez.</p>
      </article>
      <div className="grid gap-4">
        <DataTable headers={['Firma', 'Kullanıcı', 'Paket', 'Bayi', 'Tarih', 'Yenileme', '']} rows={state.tenants.map((tenant: AdminTenant) => [
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Abone düzenle</p>
                <h3 className="mt-2 text-2xl font-semibold">{editDraft.company_name || editDraft.tenant_id}</h3>
              </div>
              <button type="button" onClick={saveEditDraft} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${editSaved ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-500'}`}>
                {editSaved ? '✓ Kaydedildi' : 'Kaydet'}
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Firma adı</span>
                <input value={editDraft.company_name} onChange={(e) => setEditDraft((c) => c ? { ...c, company_name: e.target.value } : c)} className="input-dark" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Kullanıcı adı</span>
                  <input value={editDraft.admin_username} onChange={(e) => setEditDraft((c) => c ? { ...c, admin_username: e.target.value } : c)} className="input-dark" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Şifre</span>
                  <input type="password" value={editDraft.admin_password} onChange={(e) => setEditDraft((c) => c ? { ...c, admin_password: e.target.value } : c)} placeholder="••••••••" className="input-dark" />
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
                  <option value="suspended">Askıya alındı</option>
                  <option value="cancelled">İptal edildi</option>
                  <option value="trial">Deneme</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Başlangıç</span>
                  <input type="date" value={editDraft.start_date} onChange={(e) => setEditDraft((c) => c ? { ...c, start_date: e.target.value } : c)} className="input-dark" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Bitiş</span>
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
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Oluşturulma</p>
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
          <h3 className="text-xl font-semibold">{isEditing ? 'Paket düzenle' : 'Paket oluştur'}</h3>
          {isEditing ? <button type="button" onClick={resetPackageDraft} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100">Yeni paket</button> : null}
        </div>
        <div className="mt-5 grid gap-3">
          <input value={packageDraft.name} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, name: e.target.value }))} placeholder="Paket adı" className="input-dark" />
          <select value={packageDraft.package_type} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, package_type: e.target.value as PackageType, modules: getDefaultModulesForPackageType(e.target.value as PackageType) }))} className="input-dark"><option value="mini">Mini</option><option value="gold">Gold</option><option value="premium">Premium</option></select>
          <input type="number" value={packageDraft.price} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, price: Number(e.target.value) }))} placeholder="Aylık fiyat" className="input-dark" />
          <input type="number" value={packageDraft.duration_days} onChange={(e) => setPackageDraft((c: AdminPackage) => ({ ...c, duration_days: Number(e.target.value) }))} placeholder="Süre / gün" className="input-dark" />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pakete dahil modüller</p>
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
