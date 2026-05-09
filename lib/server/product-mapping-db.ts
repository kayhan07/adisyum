import type { PosUnitType, ProductMapping, ProductMappingStatus } from '@/lib/pos-mapping-store';

type GlobalMappingDb = {
  productMappings?: ProductMapping[];
};

const globalDb = globalThis as typeof globalThis & GlobalMappingDb;

function getDb() {
  if (!globalDb.productMappings) globalDb.productMappings = [];
  return globalDb.productMappings;
}

function normalizeProductKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ-]/gi, '');
}

function validate(mapping: Partial<ProductMapping>) {
  const errors: string[] = [];
  if (!mapping.pos_plu_code?.trim()) errors.push('POS PLU kodu zorunlu.');
  if (![1, 10, 20].includes(Number(mapping.vat_rate))) errors.push('KDV oranı %1, %10 veya %20 olmalı.');
  if (!mapping.unit_type) errors.push('Birim tipi zorunlu.');
  return { valid: errors.length === 0, errors };
}

export function listServerProductMappings() {
  return getDb();
}

export function getServerProductMapping(productId: string) {
  const key = normalizeProductKey(productId);
  return getDb().find((mapping) => mapping.product_id === productId || normalizeProductKey(mapping.product_name) === key) ?? null;
}

export function upsertServerProductMapping(input: Partial<ProductMapping>) {
  const validation = validate(input);
  const productName = input.product_name || input.product_id || 'Ürün';
  const mapping: ProductMapping = {
    tenant_id: input.tenant_id || 'default',
    product_id: input.product_id || normalizeProductKey(productName),
    product_name: productName,
    pos_plu_code: (input.pos_plu_code || '').trim().toUpperCase(),
    vat_rate: Number(input.vat_rate || 10),
    unit_type: (input.unit_type || 'adet') as PosUnitType,
    verified: validation.valid ? Boolean(input.verified ?? true) : false,
    status: (validation.valid ? 'valid' : 'invalid') as ProductMappingStatus,
    updated_at: new Date().toISOString(),
  };

  const db = getDb();
  const index = db.findIndex((item) => item.product_id === mapping.product_id);
  if (index >= 0) db[index] = mapping;
  else db.unshift(mapping);
  return mapping;
}

export function bulkUpsertServerProductMappings(mappings: Array<Partial<ProductMapping>>) {
  return mappings.map((mapping) => upsertServerProductMapping(mapping));
}

export function getServerProductMappingCoverage(productIds: string[] = []) {
  const mappings = getDb();
  const mappedCount = productIds.length
    ? productIds.filter((productId) => Boolean(getServerProductMapping(productId))).length
    : mappings.filter((mapping) => mapping.status === 'valid').length;

  return {
    mapped: mappedCount,
    total: productIds.length || mappings.length,
    missing: Math.max((productIds.length || mappings.length) - mappedCount, 0),
    required: true,
  };
}
