export type ProductDomainType = 'stock_item' | 'sale_product' | 'semi_product' | 'combo_product';
export type SellableProductDomainType = 'sale_product' | 'combo_product';

export const SELLABLE_PRODUCT_TYPES = ['sale_product', 'combo_product'] as const;
export const INVENTORY_ONLY_PRODUCT_TYPES = ['stock_item', 'semi_product'] as const;
const ALL_PRODUCT_DOMAIN_TYPES = [...SELLABLE_PRODUCT_TYPES, ...INVENTORY_ONLY_PRODUCT_TYPES] as const;

const rawMaterialKeywords = [
  'sut',
  'domates',
  'un',
  'seker',
  'kahve cekirdegi',
  'coffee beans',
  'kiyma',
  'dana',
  'kuzu',
  'patlican',
  'zeytinyagi',
  'yogurt',
  'mascarpone',
  'levrek',
  'pul biber',
  'tuz',
  'maya',
  'hamur',
  'sos baz',
];

const rawMaterialCategoryKeywords = [
  'hammadde',
  'ham madde',
  'stok',
  'depo',
  'malzeme',
  'ingredient',
  'raw material',
];

const semiProductKeywords = ['hazir sos', 'marine', 'marinasyon', 'pizza hamuru', 'kofte harci'];
const comboKeywords = ['menu', 'combo', 'aile paketi', 'set'];
const rawMaterialKeywordSet = new Set(rawMaterialKeywords);

export function normalizeProductDomainText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('Ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('Ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('Ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('Ö', 'o')
    .replaceAll('ç', 'c')
    .replaceAll('Ç', 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isLikelyRawMaterialName(name: string) {
  const normalized = normalizeProductDomainText(name);
  return rawMaterialKeywords.some((keyword) => {
    if (normalized === keyword) return true;
    if (rawMaterialKeywordSet.has(keyword) && !keyword.includes(' ')) {
      return false;
    }
    return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(normalized);
  });
}

export function isRawMaterialCategory(category?: string | null) {
  if (!category) return false;
  const normalized = normalizeProductDomainText(category);
  return rawMaterialCategoryKeywords.some((keyword) => normalized === keyword || normalized.includes(keyword));
}

export function getAllowedProductTypesForCategory(category?: string | null): ProductDomainType[] {
  if (isRawMaterialCategory(category)) return ['stock_item', 'semi_product'];
  const normalized = normalizeProductDomainText(category ?? '');
  if (normalized.includes('combo') || normalized.includes('menu')) return ['sale_product', 'combo_product'];
  return ['sale_product', 'combo_product'];
}

export function canCategoryAcceptProductType(category: string | null | undefined, productType: ProductDomainType) {
  return getAllowedProductTypesForCategory(category).includes(productType);
}

export function inferProductDomainType(input: { name: string; category?: string | null; explicitType?: string | null }): ProductDomainType {
  const explicit = input.explicitType as ProductDomainType | undefined;
  if (explicit && ALL_PRODUCT_DOMAIN_TYPES.includes(explicit)) return explicit;

  const text = normalizeProductDomainText(`${input.category ?? ''} ${input.name}`);
  if (comboKeywords.some((keyword) => text.includes(keyword))) return 'combo_product';
  if (semiProductKeywords.some((keyword) => text.includes(keyword))) return 'semi_product';
  if (isRawMaterialCategory(input.category)) return 'stock_item';
  if (!input.category && isLikelyRawMaterialName(input.name)) return 'stock_item';
  return 'sale_product';
}

export function isSellableProductType(productType?: string | null) {
  return (SELLABLE_PRODUCT_TYPES as readonly string[]).includes(productType ?? '');
}

export function isInventoryOnlyProductType(productType?: string | null) {
  return (INVENTORY_ONLY_PRODUCT_TYPES as readonly string[]).includes(productType ?? '');
}

type ProductDomainCandidate = {
  id?: string | null;
  posKey?: string | null;
  name?: string | null;
  category?: string | null;
  productType?: string | null;
  price?: number | string | null;
  salePrice?: number | string | null;
};

function isKnownProductDomainType(value?: string | null): value is ProductDomainType {
  return Boolean(value && ALL_PRODUCT_DOMAIN_TYPES.includes(value as ProductDomainType));
}

function parsePriceCandidate(value: unknown) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveProductDomainType(product: ProductDomainCandidate): ProductDomainType {
  return inferProductDomainType({
    name: product.name ?? '',
    category: product.category,
    explicitType: product.productType,
  });
}

export function resolvePosFacingProductDomainType(product: ProductDomainCandidate): ProductDomainType {
  if (isSellableProductType(product.productType)) return product.productType as ProductDomainType;

  const hasSalesCategory = Boolean(product.category && !isRawMaterialCategory(product.category));
  const price = parsePriceCandidate(product.price ?? product.salePrice);
  if (
    isKnownProductDomainType(product.productType)
    && isInventoryOnlyProductType(product.productType)
    && hasSalesCategory
    && price > 0
  ) {
    return inferProductDomainType({
      name: product.name ?? '',
      category: product.category,
      explicitType: null,
    });
  }

  return resolveProductDomainType(product);
}

export function warnIfInventoryProductsInPosPayload<T extends ProductDomainCandidate>(source: string, products: T[]) {
  const leaked = products
    .map((product) => ({ product, productType: resolvePosFacingProductDomainType(product) }))
    .filter((entry) => isInventoryOnlyProductType(entry.productType));

  if (leaked.length === 0) return;

  console.error('[product-domain-boundary] inventory-only products blocked from POS payload', {
    source,
    count: leaked.length,
    products: leaked.slice(0, 20).map(({ product, productType }) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      productType,
    })),
  });
}

export function filterSellableProducts<T extends ProductDomainCandidate>(products: T[], source = 'unknown') {
  warnIfInventoryProductsInPosPayload(source, products);
  const filtered = products.filter((product) => isSellableProductType(resolvePosFacingProductDomainType(product)));
  if (products.length > 0 && filtered.length === 0) {
    console.error('[product-domain-boundary] POS catalog empty after productType filtering', {
      source,
      count: products.length,
      sample: products.slice(0, 20).map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        productType: product.productType,
      })),
    });
  }
  return filtered;
}
