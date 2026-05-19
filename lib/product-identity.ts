export type ProductIdentityInput = {
  id?: string | null;
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  posKey?: string | null;
  externalId?: string | null;
  legacyKey?: string | null;
};

export type ProductIdentity = {
  id?: string;
  posKey: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  identityHealth: 'canonical' | 'legacy-compatible' | 'generated';
};

const POS_KEY_PREFIX = 'POS';

export function isUuidIdentity(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function normalizeIdentityText(value: string) {
  return value
    .trim()
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function hashProductIdentity(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

export function createPosKey(seed: string) {
  const normalized = normalizeIdentityText(seed) || 'PRODUCT';
  return `${POS_KEY_PREFIX}-${hashProductIdentity(normalized)}`;
}

export function resolveProductIdentity(input: ProductIdentityInput): ProductIdentity {
  const cleanPosKey = input.posKey?.trim();
  const legacyKey = input.legacyKey?.trim() || (!isUuidIdentity(input.id) ? input.id?.trim() : undefined) || input.name?.trim();
  const seed = cleanPosKey || input.sku || input.barcode || input.externalId || legacyKey || input.id || input.name || 'product';
  const posKey = cleanPosKey || createPosKey(seed);

  return {
    id: input.id?.trim() || undefined,
    posKey,
    sku: input.sku?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    externalId: input.externalId?.trim() || undefined,
    legacyKey: legacyKey || undefined,
    identityHealth: cleanPosKey ? 'canonical' : legacyKey ? 'legacy-compatible' : 'generated',
  };
}

export function resolveRuntimeProductKey(input: ProductIdentityInput) {
  return resolveProductIdentity(input).posKey;
}

export function isLegacyRuntimeProductKey(value?: string | null) {
  return Boolean(value && !value.startsWith(`${POS_KEY_PREFIX}-`) && !isUuidIdentity(value));
}
