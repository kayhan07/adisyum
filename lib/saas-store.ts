'use client';

import { sanitizePackageModules, type PackageModuleKey } from '@/lib/package-access';

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

const TENANT_STORAGE_KEY = 'adisyon-saas-tenants';
const TENANT_CREDENTIAL_STORAGE_KEY = 'adisyon-saas-tenant-credentials';
const AUTH_STORAGE_KEY = 'adisyon-auth-token';
const AUTH_COOKIE_KEY = 'adisyon_auth_token';
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

const SYSTEM_ADMIN_STORAGE_KEY = 'adisyon-system-admin-erp';
let cachedStoredPackages: StoredPackageDefinition[] = [];
let cachedSystemAdminRaw: string | null | undefined = undefined;

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadTenants(): TenantRecord[] {
  if (!canUseStorage()) return DEFAULT_TENANTS;
  try {
    const raw = window.localStorage.getItem(TENANT_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(DEFAULT_TENANTS));
      return DEFAULT_TENANTS;
    }
    const parsed = JSON.parse(raw);
    const storedTenants = Array.isArray(parsed) ? parsed : [];
    const mergedTenants = [
      ...DEFAULT_TENANTS.filter((defaultTenant) => !storedTenants.some((tenant) => tenant?.tenant_id === defaultTenant.tenant_id)),
      ...storedTenants,
    ];
    if (mergedTenants.length !== storedTenants.length) {
      window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(mergedTenants));
    }
    return (mergedTenants.length > 0 ? mergedTenants : DEFAULT_TENANTS).map((tenant) => ({
      ...tenant,
      package_id: tenant.package_id,
    }));
  } catch {
    window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(DEFAULT_TENANTS));
    return DEFAULT_TENANTS;
  }
}

export function loadTenantCredentials(): TenantCredential[] {
  if (!canUseStorage()) return DEFAULT_TENANT_CREDENTIALS;
  try {
    const raw = window.localStorage.getItem(TENANT_CREDENTIAL_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(TENANT_CREDENTIAL_STORAGE_KEY, JSON.stringify(DEFAULT_TENANT_CREDENTIALS));
      return DEFAULT_TENANT_CREDENTIALS;
    }
    const parsed = JSON.parse(raw);
    const storedCredentials = Array.isArray(parsed) ? parsed : [];
    const mergedCredentials = [
      ...DEFAULT_TENANT_CREDENTIALS.filter((defaultCredential) => !storedCredentials.some(
        (credential) => credential?.tenant_id === defaultCredential.tenant_id && credential?.username === defaultCredential.username,
      )),
      ...storedCredentials,
    ];
    if (mergedCredentials.length !== storedCredentials.length) {
      window.localStorage.setItem(TENANT_CREDENTIAL_STORAGE_KEY, JSON.stringify(mergedCredentials));
    }
    return mergedCredentials;
  } catch {
    window.localStorage.setItem(TENANT_CREDENTIAL_STORAGE_KEY, JSON.stringify(DEFAULT_TENANT_CREDENTIALS));
    return DEFAULT_TENANT_CREDENTIALS;
  }
}

export function saveTenantCredentials(credentials: TenantCredential[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(TENANT_CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
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
  if (!canUseStorage()) return;
  window.localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenants));
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
  const token = btoa(unescape(encodeURIComponent(JSON.stringify(input))));
  if (canUseStorage()) window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
  }
  return token;
}

export function loadAuthToken(): TenantAuthToken | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as TenantAuthToken;
  } catch {
    return null;
  }
}

export function clearAuthToken() {
  if (canUseStorage()) window.localStorage.removeItem(AUTH_STORAGE_KEY);
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function canPackageAccessModule(packageType: PackageType, moduleId: string, packageId?: string) {
  return getPackageModules(packageType, packageId ?? loadAuthToken()?.package_id).includes(moduleId as PackageModuleKey);
}

function loadStoredPackages(): StoredPackageDefinition[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SYSTEM_ADMIN_STORAGE_KEY);
    if (raw === cachedSystemAdminRaw) return cachedStoredPackages;
    if (!raw) {
      cachedSystemAdminRaw = raw;
      cachedStoredPackages = [];
      return [];
    }
    const parsed = JSON.parse(raw) as { packages?: StoredPackageDefinition[] };
    cachedSystemAdminRaw = raw;
    cachedStoredPackages = Array.isArray(parsed?.packages) ? parsed.packages : [];
    return cachedStoredPackages;
  } catch {
    cachedSystemAdminRaw = undefined;
    cachedStoredPackages = [];
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
  const onStorage = (event: StorageEvent) => {
    if (event.key === TENANT_STORAGE_KEY || event.key === AUTH_STORAGE_KEY || event.key === SYSTEM_ADMIN_STORAGE_KEY) {
      if (event.key === SYSTEM_ADMIN_STORAGE_KEY) {
        cachedSystemAdminRaw = undefined;
        cachedStoredPackages = [];
      }
      callback();
    }
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function createTenantId() {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ABN-${random}`;
}
