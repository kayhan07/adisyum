import {
  getAllowedProductTypesForCategory,
  isInventoryOnlyProductType,
  isSellableProductType,
  normalizeProductDomainText,
  resolvePosFacingProductDomainType,
  type ProductDomainType,
} from '@/lib/product-domain';

export type ExtendedProductDomainType = ProductDomainType | 'modifier' | 'variant';

export type CategoryDomainDefinition = {
  name: string;
  allowedProductTypes: ExtendedProductDomainType[];
  visibleInPos: boolean;
  visibleInInventory: boolean;
  visibleInProduction: boolean;
  branchVisibleByDefault: boolean;
};

export type ProductDomainGraphInput = {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  categoryId?: string | null;
  categoryAllowedProductTypes?: unknown;
  productType?: string | null;
  price?: number | string | null;
  salePrice?: number | string | null;
  posKey?: string | null;
  catalogRevision?: string | null;
  productSnapshot?: unknown;
  lifecycleStatus?: string | null;
  publishStatus?: string | null;
  active?: boolean | null;
  deletedAt?: string | Date | null;
  archivedAt?: string | Date | null;
  branchId?: string | null;
  branchVisible?: boolean | null;
};

export type ProductDomainGraphIssueCode =
  | 'missing_category'
  | 'missing_product_type'
  | 'invalid_product_type'
  | 'invalid_category_assignment'
  | 'stock_item_pos_visible'
  | 'semi_product_pos_visible'
  | 'modifier_pos_visible'
  | 'missing_pos_key'
  | 'missing_catalog_revision'
  | 'missing_runtime_snapshot'
  | 'malformed_runtime_snapshot'
  | 'invalid_visibility'
  | 'not_runtime_visible'
  | 'deleted_product'
  | 'archived_product';

export type ProductDomainGraphIssue = {
  code: ProductDomainGraphIssueCode;
  severity: 'warning' | 'critical';
  message: string;
};

export type ProductDomainGraphValidation = {
  ok: boolean;
  productType: ExtendedProductDomainType;
  category: CategoryDomainDefinition;
  posVisible: boolean;
  runtimeVisible: boolean;
  issues: ProductDomainGraphIssue[];
};

export const CATEGORY_DOMAIN_PRESETS: CategoryDomainDefinition[] = [
  { name: 'Hammaddeler', allowedProductTypes: ['stock_item'], visibleInPos: false, visibleInInventory: true, visibleInProduction: false, branchVisibleByDefault: false },
  { name: 'Hammadde / Stok', allowedProductTypes: ['stock_item'], visibleInPos: false, visibleInInventory: true, visibleInProduction: false, branchVisibleByDefault: false },
  { name: 'Yarı Mamüller', allowedProductTypes: ['semi_product'], visibleInPos: false, visibleInInventory: true, visibleInProduction: true, branchVisibleByDefault: false },
  { name: 'Yarı Mamül', allowedProductTypes: ['semi_product'], visibleInPos: false, visibleInInventory: true, visibleInProduction: true, branchVisibleByDefault: false },
  { name: 'Satış Ürünleri', allowedProductTypes: ['sale_product'], visibleInPos: true, visibleInInventory: false, visibleInProduction: false, branchVisibleByDefault: true },
  { name: 'İçecekler', allowedProductTypes: ['sale_product'], visibleInPos: true, visibleInInventory: false, visibleInProduction: false, branchVisibleByDefault: true },
  { name: 'Combo', allowedProductTypes: ['combo_product'], visibleInPos: true, visibleInInventory: false, visibleInProduction: false, branchVisibleByDefault: true },
  { name: 'Modifier', allowedProductTypes: ['modifier'], visibleInPos: false, visibleInInventory: false, visibleInProduction: false, branchVisibleByDefault: false },
  { name: 'Varyant', allowedProductTypes: ['variant'], visibleInPos: false, visibleInInventory: false, visibleInProduction: false, branchVisibleByDefault: false },
];

export const PRODUCT_TYPE_CATEGORY_DEFAULTS: Record<ExtendedProductDomainType, string> = {
  stock_item: 'Hammaddeler',
  sale_product: 'Satış Ürünleri',
  semi_product: 'Yarı Mamüller',
  combo_product: 'Combo',
  modifier: 'Modifier',
  variant: 'Varyant',
};

function parseAllowedTypes(value: unknown): ExtendedProductDomainType[] {
  const raw = Array.isArray(value) ? value : [];
  return raw.filter((item): item is ExtendedProductDomainType =>
    item === 'stock_item'
    || item === 'sale_product'
    || item === 'semi_product'
    || item === 'combo_product'
    || item === 'modifier'
    || item === 'variant',
  );
}

export function normalizeCategoryName(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeProductTypeForDomainGraph(input: ProductDomainGraphInput): ExtendedProductDomainType {
  if (input.productType === 'modifier' || input.productType === 'variant') return input.productType;
  return resolvePosFacingProductDomainType({
    id: input.id,
    posKey: input.posKey,
    name: input.name,
    category: input.category,
    productType: input.productType,
    price: input.price ?? input.salePrice,
  }) as ProductDomainType;
}

export function inferAllowedTypesForCategory(categoryName?: string | null, explicitAllowed?: unknown): ExtendedProductDomainType[] {
  const explicit = parseAllowedTypes(explicitAllowed);
  if (explicit.length > 0) return explicit;

  const normalized = normalizeProductDomainText(categoryName ?? '');
  const preset = CATEGORY_DOMAIN_PRESETS.find((item) => normalizeProductDomainText(item.name) === normalized);
  if (preset) return preset.allowedProductTypes;
  if (normalized.includes('hammadde') || normalized.includes('stok') || normalized.includes('malzeme')) return ['stock_item'];
  if (normalized.includes('yari') || normalized.includes('hazirlik') || normalized.includes('uretim')) return ['semi_product'];
  if (normalized.includes('combo') || normalized.includes('menu')) return ['combo_product'];
  if (normalized.includes('modifier') || normalized.includes('opsiyon')) return ['modifier'];
  if (normalized.includes('varyant') || normalized.includes('variant')) return ['variant'];
  return getAllowedProductTypesForCategory(categoryName) as ExtendedProductDomainType[];
}

export function getCategoryDomainDefinition(categoryName?: string | null, explicitAllowed?: unknown): CategoryDomainDefinition {
  const name = normalizeCategoryName(categoryName) || 'Kategorisiz';
  const allowedProductTypes = inferAllowedTypesForCategory(name, explicitAllowed);
  const allowsSellable = allowedProductTypes.some((type) => type === 'sale_product' || type === 'combo_product');
  const allowsInventory = allowedProductTypes.some((type) => type === 'stock_item' || type === 'semi_product');
  return {
    name,
    allowedProductTypes,
    visibleInPos: allowsSellable,
    visibleInInventory: allowsInventory,
    visibleInProduction: allowedProductTypes.includes('semi_product'),
    branchVisibleByDefault: allowsSellable,
  };
}

function snapshotObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function validateProductDomainGraph(input: ProductDomainGraphInput, options: { requireRuntimeFields?: boolean } = {}): ProductDomainGraphValidation {
  const productType = normalizeProductTypeForDomainGraph(input);
  const category = getCategoryDomainDefinition(input.category, input.categoryAllowedProductTypes);
  const issues: ProductDomainGraphIssue[] = [];
  const hasCategory = Boolean(category.name && category.name !== 'Kategorisiz');

  if (!hasCategory && productType !== 'modifier' && productType !== 'variant') {
    issues.push({ code: 'missing_category', severity: 'critical', message: 'Product must be attached to a valid category.' });
  }
  if (!input.productType) {
    issues.push({ code: 'missing_product_type', severity: 'warning', message: 'Product type was inferred; persist an explicit productType.' });
  }
  if (!['stock_item', 'sale_product', 'semi_product', 'combo_product', 'modifier', 'variant'].includes(productType)) {
    issues.push({ code: 'invalid_product_type', severity: 'critical', message: 'Product type is not part of the governed domain model.' });
  }
  if (!category.allowedProductTypes.includes(productType)) {
    issues.push({
      code: 'invalid_category_assignment',
      severity: 'critical',
      message: `${productType} is not allowed in category "${category.name}".`,
    });
  }

  const posVisible = isSellableProductType(productType);
  if (productType === 'stock_item' && posVisible) issues.push({ code: 'stock_item_pos_visible', severity: 'critical', message: 'Stock items cannot be POS visible.' });
  if (productType === 'semi_product' && posVisible) issues.push({ code: 'semi_product_pos_visible', severity: 'critical', message: 'Semi products cannot be POS visible.' });
  if ((productType === 'modifier' || productType === 'variant') && posVisible) issues.push({ code: 'modifier_pos_visible', severity: 'critical', message: 'Modifier and variant records cannot enter POS catalog.' });

  if (input.deletedAt) issues.push({ code: 'deleted_product', severity: 'critical', message: 'Deleted products are excluded from runtime catalogs.' });
  if (input.archivedAt || input.lifecycleStatus === 'archived') issues.push({ code: 'archived_product', severity: 'critical', message: 'Archived products are excluded from runtime catalogs.' });
  if (input.active === false || input.publishStatus === 'draft' || input.publishStatus === 'failed' || input.lifecycleStatus === 'deleted') {
    issues.push({ code: 'not_runtime_visible', severity: 'critical', message: 'Product lifecycle/publish state is not runtime visible.' });
  }
  if (input.branchVisible === false && posVisible) {
    issues.push({ code: 'invalid_visibility', severity: 'critical', message: 'Sellable product is hidden for this branch.' });
  }

  if (options.requireRuntimeFields && posVisible) {
    const snapshot = snapshotObject(input.productSnapshot);
    if (!input.posKey) issues.push({ code: 'missing_pos_key', severity: 'critical', message: 'Runtime product is missing posKey.' });
    if (!input.catalogRevision) issues.push({ code: 'missing_catalog_revision', severity: 'critical', message: 'Runtime product is missing catalogRevision.' });
    if (!snapshot) {
      issues.push({ code: 'missing_runtime_snapshot', severity: 'critical', message: 'Runtime product is missing immutable snapshot.' });
    } else if (snapshot.posKey !== input.posKey || snapshot.productType !== productType || typeof snapshot.name !== 'string') {
      issues.push({ code: 'malformed_runtime_snapshot', severity: 'critical', message: 'Runtime snapshot does not match product identity.' });
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'critical'),
    productType,
    category,
    posVisible,
    runtimeVisible: posVisible && issues.every((issue) => issue.severity !== 'critical'),
    issues,
  };
}

export function getDefaultCategoryForProductType(productType: ExtendedProductDomainType) {
  return PRODUCT_TYPE_CATEGORY_DEFAULTS[productType];
}

export function getCategoryOptionsForProductType(categories: string[], productType: ExtendedProductDomainType) {
  const merged = [...CATEGORY_DOMAIN_PRESETS.map((category) => category.name), ...categories]
    .map(normalizeCategoryName)
    .filter(Boolean);
  return Array.from(new Set(merged)).filter((category) =>
    getCategoryDomainDefinition(category).allowedProductTypes.includes(productType),
  );
}

export function coerceCategoryForProductType(category: string | null | undefined, productType: ExtendedProductDomainType, categories: string[] = []) {
  const normalized = normalizeCategoryName(category);
  const options = getCategoryOptionsForProductType(categories, productType);
  if (normalized && options.some((item) => normalizeProductDomainText(item) === normalizeProductDomainText(normalized))) return normalized;
  return options[0] ?? getDefaultCategoryForProductType(productType);
}

export function isInventoryOnlyDomainType(productType: ExtendedProductDomainType) {
  return productType === 'modifier' || productType === 'variant' || isInventoryOnlyProductType(productType);
}
