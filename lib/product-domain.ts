export type ProductDomainType = 'stock_item' | 'sale_product' | 'semi_product' | 'combo_product';

const rawMaterialKeywords = [
  'sut',
  'süt',
  'domates',
  'un',
  'seker',
  'şeker',
  'kahve çekirdeği',
  'coffee beans',
  'kiyma',
  'kıyma',
  'dana',
  'kuzu',
  'patlican',
  'patlıcan',
  'zeytinyagi',
  'zeytinyağı',
  'yogurt',
  'yoğurt',
  'mascarpone',
  'levrek',
  'pul biber',
  'tuz',
  'maya',
  'hamur',
  'sos baz',
];

const semiProductKeywords = ['hazir sos', 'hazır sos', 'marine', 'marinasyon', 'pizza hamuru', 'köfte harcı'];
const comboKeywords = ['menu', 'menü', 'combo', 'aile paketi', 'set'];

export function normalizeProductDomainText(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function isLikelyRawMaterialName(name: string) {
  const normalized = normalizeProductDomainText(name);
  return rawMaterialKeywords.some((keyword) => normalized === keyword || normalized.includes(keyword));
}

export function inferProductDomainType(input: { name: string; category?: string | null; explicitType?: string | null }): ProductDomainType {
  const explicit = input.explicitType as ProductDomainType | undefined;
  if (explicit && ['stock_item', 'sale_product', 'semi_product', 'combo_product'].includes(explicit)) return explicit;

  const text = normalizeProductDomainText(`${input.category ?? ''} ${input.name}`);
  if (comboKeywords.some((keyword) => text.includes(keyword))) return 'combo_product';
  if (semiProductKeywords.some((keyword) => text.includes(keyword))) return 'semi_product';
  if (isLikelyRawMaterialName(input.name)) return 'stock_item';
  return 'sale_product';
}

export function isSellableProductType(productType?: string | null) {
  return productType === 'sale_product' || productType === 'combo_product';
}

export function isInventoryOnlyProductType(productType?: string | null) {
  return productType === 'stock_item' || productType === 'semi_product';
}
