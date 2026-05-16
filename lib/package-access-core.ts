import type { PackageType } from '@/lib/saas-store';

export type PackageModuleKey =
  | 'floor'
  | 'orders'
  | 'qr'
  | 'qr-menu'
  | 'products'
  | 'finance'
  | 'delivery'
  | 'kds'
  | 'branches'
  | 'reports'
  | 'settings'
  | 'overview'
  | 'warehouse'
  | 'bar-control'
  | 'saas';

export const PACKAGE_MODULE_KEYS = [
  'floor',
  'orders',
  'qr',
  'qr-menu',
  'products',
  'finance',
  'delivery',
  'kds',
  'branches',
  'reports',
  'settings',
  'overview',
  'warehouse',
  'bar-control',
  'saas',
] as const satisfies readonly PackageModuleKey[];

export const DEFAULT_PACKAGE_MODULES: Record<PackageType, PackageModuleKey[]> = {
  mini: ['floor', 'orders', 'products', 'finance', 'settings'],
  gold: ['floor', 'orders', 'qr', 'qr-menu', 'products', 'finance', 'delivery', 'kds', 'settings'],
  premium: ['floor', 'orders', 'qr', 'qr-menu', 'products', 'finance', 'delivery', 'kds', 'branches', 'reports', 'settings', 'overview', 'warehouse', 'bar-control', 'saas'],
};

const VALID_MODULES = new Set<PackageModuleKey>(PACKAGE_MODULE_KEYS);

export function getDefaultModulesForPackageType(packageType: PackageType): PackageModuleKey[] {
  return [...DEFAULT_PACKAGE_MODULES[packageType]];
}

export function sanitizePackageModules(modules: string[] | undefined, packageType: PackageType): PackageModuleKey[] {
  const normalized = Array.isArray(modules)
    ? modules.filter((item): item is PackageModuleKey => VALID_MODULES.has(item as PackageModuleKey))
    : [];

  return normalized.length > 0 ? Array.from(new Set(normalized)) : getDefaultModulesForPackageType(packageType);
}
