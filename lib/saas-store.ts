'use client';

import { sanitizePackageModules, type PackageModuleKey } from '@/lib/package-access-core';
import { readRuntimeItem } from '@/lib/client/runtime-state';

export type PackageType = 'mini' | 'gold' | 'premium';
export type TenantStatus = 'active' | 'expired' | 'demo' | 'blocked';

export type TenantRecord = {
  id: string;
  tenant_id: string;
  name: string;
  package_id?: string;
  package_type: PackageType;
  start_date: string;
  end_date: string;
  demo_enabled: boolean;
  status: TenantStatus;
  main_branch_id: string;
  created_at: string;
};

export type TenantCredential = {
  tenant_id: string;
  username: string;
  password: string;
  role: string;
  name: string;
  branch_id: string;
  active: boolean;
};

export type TenantAuthToken = {
  tenant_id: string;
  username: string;
  role: string;
  package_id?: string;
  package_type: PackageType;
  branch_id: string;
  is_main_branch: boolean;
  expires_at: string;
};

const EVENT_NAME = 'adisyon-saas-tenants:changed';

const DEFAULT_TENANTS: TenantRecord[] = [
  {
    id: 'ten-demo',
    tenant_id: 'ABN-48291',
    name: 'Adisyon Demo Bistro',
    package_id: 'pkg-premium',
    package_type: 'premium',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    demo_enabled: true,
    status: 'demo',
    main_branch_id: 'mrk',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const DEFAULT_TENANT_CREDENTIALS: TenantCredential[] = [
  {
    tenant_id: 'ABN-48291',
    username: 'admin',
    password: '1234',
    role: 'Admin',
    name: 'Demo Admin',
    branch_id: 'mrk',
    active: true,
  },
];

type StoredPackageDefinition = {
  id?: string;
  package_type: PackageType;
  modules?: string[];
};

const SYSTEM_ADMIN_STATE_KEY = 'system-admin-state';
let currentAuthToken: TenantAuthToken | null = null;

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadTenants(): TenantRecord[] {
  return DEFAULT_TENANTS;
}

export function loadTenantCredentials(): TenantCredential[] {
  return DEFAULT_TENANT_CREDENTIALS;
}

export function saveTenantCredentials(credentials: TenantCredential[]) {
  void credentials;
  emitChange();
}

export function upsertTenantCredential(credential: TenantCredential) {
  const credentials = loadTenantCredentials();
  const index = credentials.findIndex((item) =>
    item.tenant_id.toLocaleLowerCase('tr-TR') === credential.tenant_id.toLocaleLowerCase('tr-TR')
      && item.username.toLocaleLowerCase('tr-TR') === credential.username.toLocaleLowerCase('tr-TR')
  );

  const next = index >= 0
    ? credentials.map((item, itemIndex) => (itemIndex === index ? credential : item))
    : [credential, ...credentials];

  saveTenantCredentials(next);
  return credential;
}

export function listTenantCredentials(tenantId: string) {
  const normalizedTenantId = tenantId.trim().toLocaleLowerCase('tr-TR');
  return loadTenantCredentials().filter((credential) =>
    credential.tenant_id.toLocaleLowerCase('tr-TR') === normalizedTenantId,
  );
}

export function findTenantCredential(tenantId: string, username: string) {
  const normalizedTenantId = tenantId.trim().toLocaleLowerCase('tr-TR');
  const normalizedUsername = username.trim().toLocaleLowerCase('tr-TR');
  return loadTenantCredentials().find((credential) =>
    credential.tenant_id.toLocaleLowerCase('tr-TR') === normalizedTenantId
      && credential.username.toLocaleLowerCase('tr-TR') === normalizedUsername,
  ) ?? null;
}

export function saveTenants(tenants: TenantRecord[]) {
  void tenants;
  emitChange();
}

export function upsertTenant(record: TenantRecord) {
  const tenants = loadTenants();
  const index = tenants.findIndex((tenant) => tenant.tenant_id === record.tenant_id);
  const next = index >= 0
    ? tenants.map((tenant, tenantIndex) => (tenantIndex === index ? record : tenant))
    : [record, ...tenants];
  saveTenants(next);
  return record;
}

export function deleteTenant(tenantId: string) {
  saveTenants(loadTenants().filter((tenant) => tenant.tenant_id !== tenantId));
}

export function findTenant(tenantId: string) {
  return loadTenants().find((tenant) => tenant.tenant_id.toLocaleLowerCase('tr-TR') === tenantId.trim().toLocaleLowerCase('tr-TR')) ?? null;
}

export function isTenantSubscriptionActive(tenant: TenantRecord, now = new Date()) {
  if (tenant.status === 'blocked') return false;
  if (tenant.demo_enabled && tenant.status === 'demo') return true;
  return new Date(tenant.end_date).getTime() >= now.setHours(0, 0, 0, 0);
}

export function createAuthToken(input: TenantAuthToken) {
  currentAuthToken = input;
  emitChange();
  return JSON.stringify(input);
}

export function loadAuthToken(): TenantAuthToken | null {
  return currentAuthToken;
}

export function clearAuthToken() {
  currentAuthToken = null;
  emitChange();
}

export function clearAuthSnapshot() {
  clearAuthToken();
}

export function setAuthSnapshotFromSession(session: {
  tenantId: string;
  username?: string;
  role: string;
  packageType?: PackageType;
  branchId?: string;
  subscriptionEndDate?: string;
} | null) {
  currentAuthToken = session
    ? {
        tenant_id: session.tenantId,
        username: session.username ?? session.tenantId,
        role: session.role,
        package_type: session.packageType ?? 'premium',
        branch_id: session.branchId ?? 'mrk',
        is_main_branch: true,
        expires_at: session.subscriptionEndDate ?? new Date(Date.now() + 86400000).toISOString(),
      }
    : null;
  emitChange();
}

export function canPackageAccessModule(packageType: PackageType, moduleId: string, packageId?: string) {
  return getPackageModules(packageType, packageId ?? loadAuthToken()?.package_id).includes(moduleId as PackageModuleKey);
}

function loadStoredPackages(): StoredPackageDefinition[] {
  try {
    const raw = readRuntimeItem('system-admin', SYSTEM_ADMIN_STATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { packages?: StoredPackageDefinition[] };
    return Array.isArray(parsed?.packages) ? parsed.packages : [];
  } catch (error) {
    console.error('[business-flow] stored packages load failed', error);
    return [];
  }
}

export function getPackageModules(packageType: PackageType, packageId?: string) {
  const packages = loadStoredPackages();
  const exactPackage = packageId ? packages.find((pkg) => pkg.id === packageId) : undefined;
  const fallbackPackage = packages.find((pkg) => pkg.package_type === packageType);
  return sanitizePackageModules((exactPackage ?? fallbackPackage)?.modules, packageType);
}

export function subscribeToTenantChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => callback();
  window.addEventListener(EVENT_NAME, onCustom);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}

export function createTenantId() {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ABN-${random}`;
}
