import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { PosUnitType, ProductMapping, ProductMappingStatus } from '@/lib/pos-mapping-store';

const RUNTIME_KEY = 'product-mappings';

function normalizeTenantId(tenantId?: string) {
  const normalized = tenantId?.trim();
  if (!normalized) throw new Error('tenantId is required for product mappings.');
  return normalized;
}

function normalizeProductKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9ıüğüşöçİĞÜŞÖÇ-]/gi, '');
}

function validate(mapping: Partial<ProductMapping>) {
  const errors: string[] = [];
  if (!mapping.pos_plu_code?.trim()) errors.push('POS PLU kodu zorunlu.');
  if (![1, 10, 20].includes(Number(mapping.vat_rate))) errors.push('KDV orani %1, %10 veya %20 olmali.');
  if (!mapping.unit_type) errors.push('Birim tipi zorunlu.');
  return { valid: errors.length === 0, errors };
}

async function readMappings(tenantId: string) {
  const stored = await prisma.runtimeState.findUnique({
    where: { tenantId_key: { tenantId, key: RUNTIME_KEY } },
    select: { payload: true },
  });
  return Array.isArray(stored?.payload) ? stored.payload as ProductMapping[] : [];
}

async function writeMappings(tenantId: string, mappings: ProductMapping[]) {
  await prisma.runtimeState.upsert({
    where: { tenantId_key: { tenantId, key: RUNTIME_KEY } },
    update: { payload: JSON.parse(JSON.stringify(mappings)) as Prisma.InputJsonValue },
    create: { tenantId, key: RUNTIME_KEY, payload: JSON.parse(JSON.stringify(mappings)) as Prisma.InputJsonValue },
  });
}

export async function listServerProductMappings(tenantId?: string) {
  return readMappings(normalizeTenantId(tenantId));
}

export async function getServerProductMapping(productId: string, tenantId?: string) {
  const mappings = await readMappings(normalizeTenantId(tenantId));
  const key = normalizeProductKey(productId);
  return mappings.find((mapping) => mapping.product_id === productId || normalizeProductKey(mapping.product_name) === key) ?? null;
}

export async function upsertServerProductMapping(input: Partial<ProductMapping>, tenantId?: string) {
  const validation = validate(input);
  const productName = input.product_name || input.product_id || 'Urun';
  const scopedTenantId = normalizeTenantId(tenantId || input.tenant_id);
  const mapping: ProductMapping = {
    tenant_id: scopedTenantId,
    product_id: input.product_id || normalizeProductKey(productName),
    product_name: productName,
    pos_plu_code: (input.pos_plu_code || '').trim().toUpperCase(),
    vat_rate: Number(input.vat_rate || 10),
    unit_type: (input.unit_type || 'adet') as PosUnitType,
    verified: validation.valid ? Boolean(input.verified ?? true) : false,
    status: (validation.valid ? 'valid' : 'invalid') as ProductMappingStatus,
    updated_at: new Date().toISOString(),
  };

  const mappings = await readMappings(scopedTenantId);
  const index = mappings.findIndex((item) => item.product_id === mapping.product_id);
  if (index >= 0) mappings[index] = mapping;
  else mappings.unshift(mapping);
  await writeMappings(scopedTenantId, mappings);
  return mapping;
}

export async function bulkUpsertServerProductMappings(mappings: Array<Partial<ProductMapping>>, tenantId?: string) {
  const scopedTenantId = normalizeTenantId(tenantId);
  const current = await readMappings(scopedTenantId);
  const next = [...current];
  const saved: ProductMapping[] = [];

  for (const input of mappings) {
    const validation = validate(input);
    const productName = input.product_name || input.product_id || 'Urun';
    const mapping: ProductMapping = {
      tenant_id: scopedTenantId,
      product_id: input.product_id || normalizeProductKey(productName),
      product_name: productName,
      pos_plu_code: (input.pos_plu_code || '').trim().toUpperCase(),
      vat_rate: Number(input.vat_rate || 10),
      unit_type: (input.unit_type || 'adet') as PosUnitType,
      verified: validation.valid ? Boolean(input.verified ?? true) : false,
      status: (validation.valid ? 'valid' : 'invalid') as ProductMappingStatus,
      updated_at: new Date().toISOString(),
    };
    const index = next.findIndex((item) => item.product_id === mapping.product_id);
    if (index >= 0) next[index] = mapping;
    else next.unshift(mapping);
    saved.push(mapping);
  }

  await writeMappings(scopedTenantId, next);
  return saved;
}

export async function getServerProductMappingCoverage(productIds: string[] = [], tenantId?: string) {
  const mappings = await readMappings(normalizeTenantId(tenantId));
  const mappedCount = productIds.length
    ? productIds.filter((productId) => mappings.some((mapping) => mapping.product_id === productId)).length
    : mappings.filter((mapping) => mapping.status === 'valid').length;

  return {
    mapped: mappedCount,
    total: productIds.length || mappings.length,
    missing: Math.max((productIds.length || mappings.length) - mappedCount, 0),
    required: true,
  };
}
