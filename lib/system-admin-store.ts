'use client';

import { getDefaultModulesForPackageType, sanitizePackageModules, type PackageModuleKey } from '@/lib/package-access-core';
import { createTenantId, type PackageType } from '@/lib/saas-store';
import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

export type AdminPackage = {
  id: string;
  name: string;
  package_type: PackageType;
  price: number;
  duration_days: number;
  modules: PackageModuleKey[];
  features: string[];
  active: boolean;
};

export type AdminTenant = {
  id: string;
  tenant_id: string;
  company_name: string;
  package_id: string;
  package_type: PackageType;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'demo' | 'blocked';
  demo_enabled: boolean;
  auto_renew: boolean;
  admin_username: string;
  admin_password: string;
  dealer_id?: string;
  created_at: string;
};

export type AdminDealer = {
  id: string;
  name: string;
  type: 'dealer' | 'representative';
  commission_rate: number;
  phone: string;
  email: string;
  active: boolean;
};

export type AdminCommission = {
  id: string;
  sale_id: string;
  dealer_id: string;
  tenant_id: string;
  amount: number;
  rate: number;
  status: 'pending' | 'paid' | 'cancelled';
  due_date: string;
  paid_at?: string;
};

export type AdminPayment = {
  id: string;
  tenant_id: string;
  invoice_id?: string;
  amount: number;
  provider: 'iyzico' | 'paytr' | 'manual';
  status: 'pending' | 'success' | 'failed';
  transaction_id: string;
  date: string;
  error?: string;
};

export type AdminRenewal = {
  id: string;
  tenant_id: string;
  old_end_date: string;
  new_end_date: string;
  payment_id: string;
  status: 'pending' | 'completed' | 'failed';
  notified_at?: string;
  completed_at?: string;
};

export type AdminFinanceTransaction = {
  id: string;
  type: 'income' | 'expense';
  source: string;
  tenant_id?: string;
  amount: number;
  date: string;
  note: string;
};

export type AdminInvoice = {
  id: string;
  invoice_no: string;
  tenant_id: string;
  type: 'subscription' | 'payment';
  amount: number;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  issue_date: string;
  due_date: string;
};

export type AdminSale = {
  id: string;
  tenant_id: string;
  package_id: string;
  seller: string;
  dealer_id?: string;
  amount: number;
  commission_rate: number;
  commission_amount: number;
  commission_status: 'pending' | 'paid' | 'cancelled';
  date: string;
};

export type SystemAdminState = {
  packages: AdminPackage[];
  tenants: AdminTenant[];
  dealers: AdminDealer[];
  commissions: AdminCommission[];
  payments: AdminPayment[];
  renewals: AdminRenewal[];
  finance: AdminFinanceTransaction[];
  invoices: AdminInvoice[];
  sales: AdminSale[];
};

const STORAGE_KEY = 'adisyon-system-admin-erp';
const EVENT_NAME = 'adisyon-system-admin-erp:changed';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const defaultPackages: AdminPackage[] = [
  { id: 'pkg-mini', name: 'Mini', package_type: 'mini', price: 999, duration_days: 30, modules: getDefaultModulesForPackageType('mini'), features: ['POS', 'Ürünler', 'Kasa takibi'], active: true },
  { id: 'pkg-gold', name: 'Gold', package_type: 'gold', price: 1799, duration_days: 30, modules: getDefaultModulesForPackageType('gold'), features: ['Mini özellikleri', 'Paket servis', 'Kurye takibi', 'KDS'], active: true },
  { id: 'pkg-premium', name: 'Premium', package_type: 'premium', price: 2999, duration_days: 30, modules: getDefaultModulesForPackageType('premium'), features: ['Gold özellikleri', 'Çok şube', 'Gelişmiş raporlar', 'Merkez yönetim'], active: true },
];

const defaultState: SystemAdminState = {
  packages: defaultPackages,
  tenants: [],
  dealers: [
    { id: 'dealer-center', name: 'Merkez Satış', type: 'representative', commission_rate: 0, phone: '', email: 'satis@adisyon.local', active: true },
    { id: 'dealer-istanbul', name: 'İstanbul Bayi Ltd.', type: 'dealer', commission_rate: 20, phone: '', email: 'bayi@adisyon.local', active: true },
  ],
  finance: [
    { id: 'fin-2', type: 'expense', source: 'Sunucu gideri', amount: 850, date: today(), note: 'Aylık altyapı gideri' },
  ],
  invoices: [],
  sales: [],
  commissions: [],
  payments: [],
  renewals: [],
};

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function mergeDefaultState(state: Partial<SystemAdminState>): SystemAdminState {
  return {
    packages: Array.isArray(state.packages) && state.packages.length > 0
      ? state.packages.map((pkg) => ({
          ...pkg,
          modules: sanitizePackageModules(pkg.modules, pkg.package_type),
        }))
      : defaultState.packages,
    tenants: Array.isArray(state.tenants) && state.tenants.length > 0
      ? state.tenants.map((tenant) => ({
          ...tenant,
          auto_renew: Boolean(tenant.auto_renew),
          admin_username: tenant.admin_username?.trim() || 'admin',
          admin_password: tenant.admin_password?.trim() || '1234',
        }))
      : defaultState.tenants,
    dealers: Array.isArray(state.dealers) ? state.dealers : defaultState.dealers,
    commissions: Array.isArray(state.commissions) ? state.commissions : defaultState.commissions,
    payments: Array.isArray(state.payments) ? state.payments : defaultState.payments,
    renewals: Array.isArray(state.renewals) ? state.renewals : defaultState.renewals,
    finance: Array.isArray(state.finance) ? state.finance : defaultState.finance,
    invoices: Array.isArray(state.invoices) ? state.invoices : defaultState.invoices,
    sales: Array.isArray(state.sales)
      ? state.sales.map((sale) => ({
          ...sale,
          commission_amount: typeof sale.commission_amount === 'number' ? sale.commission_amount : (sale.amount * sale.commission_rate) / 100,
          commission_status: sale.commission_status ?? 'pending',
        }))
      : defaultState.sales,
  };
}

export function loadSystemAdminState(): SystemAdminState {
  try {
    const raw = readRuntimeItem('system-admin', STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = mergeDefaultState(JSON.parse(raw));
    return parsed;
  } catch (error) {
    console.error('[business-flow] system-admin state load failed', error);
    return defaultState;
  }
}

export function saveSystemAdminState(state: SystemAdminState) {
  writeRuntimeItem('system-admin', STORAGE_KEY, JSON.stringify(state));
  emitChange();
}

export function createEmptyTenantDataStructure(tenantId: string) {
  void tenantId;
}

export function syncTenantsToLogin(state: SystemAdminState) {
  void state;
}

export function subscribeToSystemAdminChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => callback();
  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('system-admin', callback);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}

export function createAdminTenantDraft() {
  return {
    tenant_id: createTenantId(),
    company_name: '',
    legal_name: '',
    tax_number: '',
    phone: '',
    email: '',
    contact_name: '',
    address: '',
    notes: '',
    package_id: 'pkg-mini',
    start_date: today(),
    end_date: addDays(30),
    status: 'active' as AdminTenant['status'],
    demo_enabled: false,
    auto_renew: false,
    admin_username: 'admin',
    admin_password: '1234',
    dealer_id: '',
  };
}

export function createRenewalNotice(tenant: AdminTenant) {
  const daysLeft = Math.ceil((new Date(tenant.end_date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'Abonelik süresi doldu.';
  if (daysLeft <= 5) return `${daysLeft} gün içinde yenileme gerekiyor.`;
  return 'Yenileme takibi normal.';
}

export function formatAdminMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}
