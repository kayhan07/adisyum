import { create } from 'zustand';
import { DEFAULT_SALE_PRODUCT_BASE } from '@/lib/sale-product-catalog';
import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';
import { shouldUseSeedBusinessData } from '@/lib/tenant-clean-start';

export type PosUnitType = 'adet' | 'kg' | 'lt' | 'gr' | 'ml' | 'porsiyon' | 'sise' | 'bardak';
export type ProductMappingStatus = 'missing' | 'valid' | 'invalid';

export type ProductMapping = {
  tenant_id: string;
  product_id: string;
  product_name: string;
  pos_plu_code: string;
  vat_rate: number;
  unit_type: PosUnitType;
  verified: boolean;
  status: ProductMappingStatus;
  updated_at: string;
};

interface MappingError {
  productId: string;
  productName: string;
  message: string;
  type: 'missing' | 'invalid' | 'unverified';
}

interface ProductMappingStore {
  errors: MappingError[];
  warnings: string[];
  addError: (error: MappingError) => void;
  removeError: (productId: string) => void;
  clearErrors: () => void;
  addWarning: (warning: string) => void;
  removeWarning: (warning: string) => void;
  clearWarnings: () => void;
  hasErrors: () => boolean;
  getErrorsByType: (type: MappingError['type']) => MappingError[];
}

export const useProductMappingStore = create<ProductMappingStore>((set, get) => ({
  errors: [],
  warnings: [],

  addError: (error) =>
    set((state) => {
      if (state.errors.some((item) => item.productId === error.productId)) {
        return state;
      }
      return { errors: [...state.errors, error] };
    }),

  removeError: (productId) =>
    set((state) => ({
      errors: state.errors.filter((item) => item.productId !== productId),
    })),

  clearErrors: () => set({ errors: [] }),

  addWarning: (warning) =>
    set((state) => ({
      warnings: [...new Set([...state.warnings, warning])],
    })),

  removeWarning: (warning) =>
    set((state) => ({
      warnings: state.warnings.filter((item) => item !== warning),
    })),

  clearWarnings: () => set({ warnings: [] }),

  hasErrors: () => get().errors.length > 0,

  getErrorsByType: (type) => get().errors.filter((item) => item.type === type),
}));

const STORAGE_KEY = 'adisyon-product-mappings';
const DEFAULT_TENANT_ID = 'default';

function canUseStorage() {
  return typeof window !== 'undefined';
}

function normalizeProductKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '');
}

function normalizePlu(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function buildSeedPluCode(productName: string) {
  const normalized = normalizeProductKey(productName).replace(/-/g, '').slice(0, 6).toUpperCase();
  const checksum = Array.from(productName).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 900;
  return `${normalized || 'PLU'}${String(checksum + 100).padStart(3, '0')}`;
}

function buildDefaultMappings(): ProductMapping[] {
  const now = new Date().toISOString();
  return DEFAULT_SALE_PRODUCT_BASE.map((product) => ({
    tenant_id: DEFAULT_TENANT_ID,
    product_id: product.id,
    product_name: product.name,
    pos_plu_code: buildSeedPluCode(product.name),
    vat_rate: Number(product.vatRate ?? 10),
    unit_type: 'porsiyon' as PosUnitType,
    verified: true,
    status: 'valid' as ProductMappingStatus,
    updated_at: now,
  }));
}

function mergeWithDefaultMappings(existing: ProductMapping[]) {
  const defaults = buildDefaultMappings();
  const keySet = new Set(
    existing.map((mapping) => `${mapping.product_id}|${normalizeProductKey(mapping.product_name)}`),
  );

  const missing = defaults.filter((mapping) => {
    const key = `${mapping.product_id}|${normalizeProductKey(mapping.product_name)}`;
    return !keySet.has(key);
  });

  return missing.length === 0 ? existing : [...existing, ...missing];
}

export function loadProductMappings(): ProductMapping[] {
  if (!canUseStorage()) return [];
  const seedMappingsAllowed = shouldUseSeedBusinessData();

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) {
      const seeded = seedMappingsAllowed ? buildDefaultMappings() : [];
      if (seeded.length > 0) {
        writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(seeded));
      }
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (parsed.length > 0 && seedMappingsAllowed) {
      const merged = mergeWithDefaultMappings(parsed as ProductMapping[]);
      if (merged.length !== parsed.length) {
        writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    }
    if (parsed.length > 0) {
      return parsed as ProductMapping[];
    }

    const seeded = seedMappingsAllowed ? buildDefaultMappings() : [];
    if (seeded.length > 0) {
      writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(seeded));
    }
    return seeded;
  } catch (error) {
    console.error('[business-flow] product mappings load failed', error);
    return [];
  }
}

export function saveProductMappings(mappings: ProductMapping[]) {
  if (!canUseStorage()) return;
  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(mappings));
  window.dispatchEvent(new CustomEvent('adisyon-product-mappings-change'));
}

export function validateProductMapping(mapping?: Partial<ProductMapping> | null) {
  const errors: string[] = [];

  if (!mapping) {
    errors.push('POS PLU eşleştirmesi yok.');
    return { valid: false, errors };
  }

  if (!normalizePlu(mapping.pos_plu_code ?? '')) errors.push('POS PLU kodu zorunlu.');
  if (![1, 10, 20].includes(Number(mapping.vat_rate))) errors.push('KDV oranı %1, %10 veya %20 olmalı.');
  if (!mapping.unit_type) errors.push('Birim tipi zorunlu.');

  return { valid: errors.length === 0, errors };
}

export function upsertProductMapping(mapping: Omit<ProductMapping, 'status' | 'updated_at'> & { updated_at?: string; status?: ProductMappingStatus }) {
  const validation = validateProductMapping(mapping);
  const nextMapping: ProductMapping = {
    ...mapping,
    tenant_id: mapping.tenant_id || DEFAULT_TENANT_ID,
    product_id: mapping.product_id || normalizeProductKey(mapping.product_name),
    pos_plu_code: normalizePlu(mapping.pos_plu_code),
    vat_rate: Number(mapping.vat_rate),
    unit_type: mapping.unit_type,
    verified: validation.valid ? Boolean(mapping.verified ?? true) : false,
    status: validation.valid ? 'valid' : 'invalid',
    updated_at: mapping.updated_at ?? new Date().toISOString(),
  };

  const mappings = loadProductMappings();
  const index = mappings.findIndex((item) => item.product_id === nextMapping.product_id);
  const nextMappings = index >= 0
    ? mappings.map((item, itemIndex) => (itemIndex === index ? nextMapping : item))
    : [nextMapping, ...mappings];

  saveProductMappings(nextMappings);
  return nextMapping;
}

export function bulkUpsertProductMappings(mappings: Array<Partial<ProductMapping>>) {
  return mappings
    .filter((mapping) => mapping.product_id || mapping.product_name)
    .map((mapping) => upsertProductMapping({
      tenant_id: mapping.tenant_id || DEFAULT_TENANT_ID,
      product_id: mapping.product_id || normalizeProductKey(mapping.product_name ?? ''),
      product_name: mapping.product_name || mapping.product_id || 'Ürün',
      pos_plu_code: mapping.pos_plu_code || '',
      vat_rate: Number(mapping.vat_rate || 10),
      unit_type: (mapping.unit_type || 'adet') as PosUnitType,
      verified: Boolean(mapping.verified ?? true),
    }));
}

export function getProductMapping(productId: string, productName?: string) {
  const normalizedName = productName ? normalizeProductKey(productName) : '';
  return loadProductMappings().find((mapping) =>
    mapping.product_id === productId ||
    mapping.product_id === normalizedName ||
    normalizeProductKey(mapping.product_name) === normalizeProductKey(productName ?? productId)
  ) ?? null;
}

export function createAutoProductMapping(product: { id: string; name: string; vatRate?: number; salesUnit?: string; category?: string }) {
  const base = normalizeProductKey(product.name).replace(/-/g, '').slice(0, 6).toUpperCase();
  const checksum = Array.from(product.name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 900;
  const unit: PosUnitType = product.salesUnit === 'kg'
    ? 'kg'
    : product.salesUnit === 'glass'
      ? 'bardak'
      : product.salesUnit === 'bottle'
        ? 'sise'
        : 'porsiyon';

  return {
    tenant_id: DEFAULT_TENANT_ID,
    product_id: product.id,
    product_name: product.name,
    pos_plu_code: `${base || 'PLU'}${String(checksum + 100).padStart(3, '0')}`,
    vat_rate: Number(product.vatRate || 10),
    unit_type: unit,
    verified: false,
  };
}

export function validateOrderProductMappings(items: Array<{ id?: string; name: string }>) {
  const missing = items.filter((item) => {
    const mapping = getProductMapping(item.id ?? item.name, item.name);
    return !validateProductMapping(mapping).valid;
  });

  return {
    valid: missing.length === 0,
    missing,
  };
}
