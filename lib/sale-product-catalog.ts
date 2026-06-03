import type { ProductRecipeOverride, RecipePoolUnit } from '@/lib/recipe-pool';
import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';
import { loadSessionState } from '@/lib/session-store';
import { compileCanonicalPosCatalog } from '@/lib/canonical-pos-catalog';
import type { ProductLifecycleStatus, ProductPublishState } from '@/lib/product-lifecycle-governance';
import { shouldUseSeedBusinessData } from '@/lib/tenant-clean-start';
import {
  filterSellableProducts,
  inferProductDomainType,
  isSellableProductType,
  resolvePosFacingProductDomainType,
  type ProductDomainType,
} from '@/lib/product-domain';
import { resolveProductIdentity } from '@/lib/product-identity';

export type VatRate = 1 | 10 | 20;
export type SaleUnitType = 'portion' | 'kg' | 'bottle' | 'glass';

export type StoredSaleProductRecipeLine = {
  ingredientId: string;
  quantity: string;
  unit?: RecipePoolUnit;
};

export type StoredOpenBottleSnapshot = {
  id: string;
  openedAt: string;
  remainingMl: number;
};

export type StoredSaleProduct = {
  id: string;
  posKey?: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  revision?: number;
  lifecycleStatus?: ProductLifecycleStatus;
  publishStatus?: ProductPublishState;
  deletedAt?: string | null;
  archivedAt?: string | null;
  name: string;
  category: string;
  productType?: ProductDomainType;
  salesUnit: SaleUnitType;
  currentStock?: string;
  lastCountedAt?: string;
  stockProcurementType?: 'recipe' | 'direct';
  barStockMode?: 'none' | 'bottle-glass';
  glassesPerBottle?: string;
  bottleVolumeCl?: string;
  portionVolumeCl?: string;
  initialBottleCount?: string;
  dispensedPortions?: string;
  openBottleSnapshots?: StoredOpenBottleSnapshot[];
  salePrice: string;
  salePrice1: string;
  salePrice2: string;
  salePrice3: string;
  price1WindowEnabled: boolean;
  price1Start: string;
  price1End: string;
  price2WindowEnabled: boolean;
  price2Start: string;
  price2End: string;
  allowComplimentary: boolean;
  allowDiscount: boolean;
  fixedMenu?: boolean;
  happyHourEligible: boolean;
  eventPriceEligible: boolean;
  vatRate: VatRate;
  salesCount: number;
  recipeLines: StoredSaleProductRecipeLine[];
  recipeId?: string;
  portionMultiplier?: string;
  recipeOverrides?: ProductRecipeOverride[];
  recipeTemplateId?: string;
  recipeOverride?: boolean;
  wastePercentage?: string;
  operationalCost?: string;
  source: 'seeded' | 'created';
  imageUrl?: string;
  thumbnailUrl?: string;
  description?: string;
};

export type PosCatalogProduct = {
  id: string;
  productId?: string;
  posKey: string;
  catalogRevision?: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  revision: number;
  lifecycleStatus?: ProductLifecycleStatus;
  publishStatus?: ProductPublishState;
  deletedAt?: string | null;
  name: string;
  category: string;
  productType: ProductDomainType;
  printCategory?: string;
  salesUnit: SaleUnitType;
  price: number;
  vatRate?: number;
  allowComplimentary: boolean;
  allowDiscount: boolean;
  happyHourEligible: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  description?: string;
};

export type SalePriceContext = {
  at?: Date;
  eventMode?: boolean;
};

const STORAGE_KEY = 'adisyon-sale-products';
const LOCAL_STORAGE_KEY = 'adisyum-local-sale-products';
const EVENT_NAME = 'adisyon-sale-products:changed';

function normalizeProductKey(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function emitSaleProductsChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function readLocalSaleProducts() {
  if (typeof window === 'undefined') return null;
  try {
    const session = loadSessionState();
    if (!session.isAuthenticated || !session.tenantId) return null;
    const tenantId = session.tenantId;
    return window.localStorage.getItem(`${LOCAL_STORAGE_KEY}:${tenantId}`);
  } catch (error) {
    console.error('[business-flow] local sale products read failed', error);
    return null;
  }
}

function writeLocalSaleProducts(value: string) {
  if (typeof window === 'undefined') return;
  try {
    const session = loadSessionState();
    if (!session.isAuthenticated || !session.tenantId) return;
    const tenantId = session.tenantId;
    window.localStorage.setItem(`${LOCAL_STORAGE_KEY}:${tenantId}`, value);
  } catch (error) {
    console.error('[business-flow] local sale products save failed', error);
  }
}

export const DEFAULT_SALE_PRODUCT_BASE: Array<Pick<StoredSaleProduct, 'id' | 'name' | 'category' | 'salePrice' | 'vatRate'>> = [
  { id: 'Espresso', name: 'Espresso', category: 'Kahve', salePrice: '95', vatRate: 10 },
  { id: 'Caffe Latte', name: 'Caffe Latte', category: 'Kahve', salePrice: '145', vatRate: 10 },
  { id: 'Cappuccino', name: 'Cappuccino', category: 'Kahve', salePrice: '140', vatRate: 10 },
  { id: 'Viski Kadeh', name: 'Viski Kadeh', category: 'Alkol', salePrice: '340', vatRate: 20 },
  { id: 'Vodka Kadeh', name: 'Vodka Kadeh', category: 'Alkol', salePrice: '320', vatRate: 20 },
  { id: 'Cin Kadeh', name: 'Cin Kadeh', category: 'Alkol', salePrice: '300', vatRate: 20 },
  { id: 'Club Sandwich', name: 'Club Sandwich', category: 'Burger', salePrice: '280', vatRate: 10 },
  { id: 'Truffle Burger', name: 'Truffle Burger', category: 'Burger', salePrice: '420', vatRate: 10 },
  { id: 'Sezar Salata', name: 'Sezar Salata', category: 'Salata', salePrice: '235', vatRate: 10 },
  { id: 'Tiramisu', name: 'Tiramisu', category: 'Tatlı', salePrice: '190', vatRate: 10 },
  { id: 'Taze Meyve Suyu', name: 'Taze Meyve Suyu', category: 'Soğuk İçecek', salePrice: '125', vatRate: 10 },
  { id: 'Maden Suyu', name: 'Maden Suyu', category: 'Soğuk İçecek', salePrice: '85', vatRate: 10 },
];

export function parseSalePrice(value: string) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function isWithinTimeWindow(date: Date, start: string, end: string) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return false;

  const currentMinutes = (date.getHours() * 60) + date.getMinutes();
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function normalizeStoredSaleProduct(product: Partial<StoredSaleProduct> & Pick<StoredSaleProduct, 'id' | 'name' | 'category'>): StoredSaleProduct {
  const salePrice1 = String(product.salePrice1 ?? product.salePrice ?? '0');
  const salePrice2 = String(product.salePrice2 ?? salePrice1);
  const salePrice3 = String(product.salePrice3 ?? salePrice1);
  const identity = resolveProductIdentity(product);

  return {
    id: product.id,
    posKey: identity.posKey,
    sku: identity.sku,
    barcode: identity.barcode,
    externalId: identity.externalId,
    legacyKey: identity.legacyKey,
    revision: product.revision ?? 1,
    lifecycleStatus: product.lifecycleStatus ?? 'published',
    publishStatus: product.publishStatus ?? 'published',
    deletedAt: product.deletedAt ?? null,
    archivedAt: product.archivedAt ?? null,
    name: product.name,
    category: product.category,
    productType: inferProductDomainType({ name: product.name, category: product.category, explicitType: product.productType }),
    salesUnit: product.salesUnit ?? 'portion',
    currentStock: product.currentStock ?? '0',
    lastCountedAt: product.lastCountedAt,
    stockProcurementType: product.stockProcurementType ?? 'recipe',
    barStockMode: product.barStockMode ?? 'none',
    glassesPerBottle: product.glassesPerBottle ?? '6',
    bottleVolumeCl: product.bottleVolumeCl ?? '70',
    portionVolumeCl: product.portionVolumeCl ?? '5',
    initialBottleCount: product.initialBottleCount ?? '0',
    dispensedPortions: product.dispensedPortions ?? '0',
    openBottleSnapshots: (product.openBottleSnapshots ?? []).map((item) => ({
      id: item.id,
      openedAt: item.openedAt,
      remainingMl: Number.isFinite(item.remainingMl) ? Math.max(0, item.remainingMl) : 0,
    })),
    salePrice: String(product.salePrice ?? salePrice1),
    salePrice1,
    salePrice2,
    salePrice3,
    price1WindowEnabled: product.price1WindowEnabled ?? true,
    price1Start: product.price1Start ?? '',
    price1End: product.price1End ?? '',
    price2WindowEnabled: Boolean(product.price2WindowEnabled),
    price2Start: product.price2Start ?? '',
    price2End: product.price2End ?? '',
    allowComplimentary: product.allowComplimentary ?? true,
    allowDiscount: product.allowDiscount ?? true,
    fixedMenu: product.fixedMenu ?? false,
    happyHourEligible: product.happyHourEligible ?? true,
    eventPriceEligible: product.eventPriceEligible ?? true,
    vatRate: product.vatRate ?? 10,
    salesCount: product.salesCount ?? 0,
    recipeLines: product.recipeLines ?? [],
    recipeId: product.recipeId,
    portionMultiplier: product.portionMultiplier,
    recipeOverrides: product.recipeOverrides,
    recipeTemplateId: product.recipeTemplateId,
    recipeOverride: product.recipeOverride,
    wastePercentage: product.wastePercentage,
    operationalCost: product.operationalCost,
    source: product.source ?? 'seeded',
  };
}

export function resolveSaleProductPrice(product: StoredSaleProduct, context: SalePriceContext = {}) {
  const now = context.at ?? new Date();
  const price1 = parseSalePrice(product.salePrice1 || product.salePrice);

  if (context.eventMode && product.eventPriceEligible) {
    return parseSalePrice(product.salePrice3) || price1;
  }

  if (
    product.happyHourEligible
    && product.price2WindowEnabled
    && product.price2Start
    && product.price2End
    && isWithinTimeWindow(now, product.price2Start, product.price2End)
  ) {
    return parseSalePrice(product.salePrice2) || price1;
  }

  if (
    product.price1WindowEnabled
    && product.price1Start
    && product.price1End
    && isWithinTimeWindow(now, product.price1Start, product.price1End)
  ) {
    return price1;
  }

  return price1;
}

export function loadStoredSaleProducts() {
  if (typeof window === 'undefined') return null;

  try {
    const runtimeRaw = readRuntimeItem('tenant', STORAGE_KEY);
    const raw = runtimeRaw ?? readLocalSaleProducts();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const products = Array.isArray(parsed)
      ? parsed
          .filter((item): item is Partial<StoredSaleProduct> & Pick<StoredSaleProduct, 'id' | 'name' | 'category'> =>
            Boolean(item && typeof item === 'object' && item.id && item.name && item.category),
          )
          .map((item) => normalizeStoredSaleProduct(item))
      : null;
    return products
      ? filterSellableProducts(products, 'sale-product-storage-load')
        .filter((product) => shouldUseSeedBusinessData() || product.source !== 'seeded')
        .map((product) => ({
          ...product,
        productType: resolvePosFacingProductDomainType({
          id: product.id,
          posKey: product.posKey,
          name: product.name,
          category: product.category,
            productType: product.productType,
            salePrice: product.salePrice1 || product.salePrice,
          }),
        }))
      : null;
  } catch (error) {
    console.error('[business-flow] sale products load failed', error);
    return null;
  }
}

export function saveStoredSaleProducts(products: StoredSaleProduct[]) {
  if (typeof window === 'undefined') return;

  try {
    const incoming = filterSellableProducts(
      products.map((item) => normalizeStoredSaleProduct(item)),
      'sale-product-storage-save-incoming',
    ).map((product) => ({
      ...product,
        productType: resolvePosFacingProductDomainType({
          id: product.id,
          posKey: product.posKey,
          name: product.name,
          category: product.category,
        productType: product.productType,
        salePrice: product.salePrice1 || product.salePrice,
      }),
    }));
    const serialized = JSON.stringify(incoming);
    writeLocalSaleProducts(serialized);
    writeRuntimeItem('tenant', STORAGE_KEY, serialized);
    emitSaleProductsChange();
  } catch (error) {
    console.error('[business-flow] sale products save failed', error);
  }
}

export function subscribeToStoredSaleProductsChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustom = () => {
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    const session = loadSessionState();
    if (!session.isAuthenticated || !session.tenantId) return;
    const tenantId = session.tenantId;
    if (event.key === `${LOCAL_STORAGE_KEY}:${tenantId}`) callback();
  };

  window.addEventListener(EVENT_NAME, handleCustom);
  window.addEventListener('storage', handleStorage);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustom);
    window.removeEventListener('storage', handleStorage);
    unsubscribeRuntime();
  };
}

export function buildPosCatalogFromStored(products: StoredSaleProduct[], context: SalePriceContext = {}): PosCatalogProduct[] {
  const items = filterSellableProducts(products, 'pos-catalog-build')
    .map((item) => {
      const normalized = normalizeStoredSaleProduct(item);
      return {
        ...normalized,
        productType: resolvePosFacingProductDomainType({
          id: normalized.id,
          posKey: normalized.posKey,
          name: normalized.name,
          category: normalized.category,
          productType: normalized.productType,
          salePrice: normalized.salePrice1 || normalized.salePrice,
        }),
      };
    })
    .filter((product) => isSellableProductType(product.productType))
    .map((product) => ({
      id: product.posKey ?? product.id,
      productId: product.id,
      posKey: product.posKey ?? product.id,
      sku: product.sku,
      barcode: product.barcode,
      externalId: product.externalId,
      legacyKey: product.legacyKey,
      revision: product.revision ?? 1,
      lifecycleStatus: product.lifecycleStatus ?? 'published',
      publishStatus: product.publishStatus ?? 'published',
      deletedAt: product.deletedAt ?? null,
      name: product.name,
      category: normalizePosCategory(product.category),
      productType: product.productType ?? 'sale_product',
      printCategory: product.category,
      salesUnit: product.salesUnit,
      price: resolveSaleProductPrice(product, context),
      vatRate: product.vatRate,
      allowComplimentary: product.allowComplimentary,
      allowDiscount: product.allowDiscount,
      happyHourEligible: product.happyHourEligible,
      imageUrl: product.imageUrl,
      thumbnailUrl: product.thumbnailUrl,
      description: product.description,
    }));
  return compileCanonicalPosCatalog(items, { channel: 'pos' }).items;
}

export function getDefaultPosCatalog(): PosCatalogProduct[] {
  const items = DEFAULT_SALE_PRODUCT_BASE.map((product) => {
    const normalized = normalizeStoredSaleProduct(product);
    return {
      id: normalized.posKey ?? normalized.id,
      productId: normalized.id,
      posKey: normalized.posKey ?? normalized.id,
      sku: normalized.sku,
      barcode: normalized.barcode,
      externalId: normalized.externalId,
      legacyKey: normalized.legacyKey,
      revision: normalized.revision ?? 1,
      lifecycleStatus: normalized.lifecycleStatus ?? 'published',
      publishStatus: normalized.publishStatus ?? 'published',
      deletedAt: normalized.deletedAt ?? null,
      name: normalized.name,
      category: normalizePosCategory(normalized.category),
      productType: normalized.productType ?? 'sale_product',
      printCategory: normalized.category,
      salesUnit: normalized.salesUnit,
      price: resolveSaleProductPrice(normalized),
      vatRate: normalized.vatRate,
      allowComplimentary: normalized.allowComplimentary,
      allowDiscount: normalized.allowDiscount,
      happyHourEligible: normalized.happyHourEligible,
    };
  });
  return compileCanonicalPosCatalog(items, { channel: 'pos' }).items;
}

export function getCatalogPriceByName(name: string, products: Array<{ name: string; price: number }>) {
  return products.find((product) => product.name === name)?.price ?? null;
}

export function getCatalogCategoryByName(name: string, products: Array<{ name: string; category: string }>) {
  return products.find((product) => product.name === name)?.category ?? null;
}

export function getCatalogVatRateByName(name: string, products: StoredSaleProduct[]) {
  return products.find((product) => product.name === name)?.vatRate ?? null;
}

function normalizePosCategory(category: string) {
  const lower = category.toLocaleLowerCase('tr-TR');
  if (lower.includes('kahve')) return 'kahve';
  if (lower.includes('burger') || lower.includes('salata') || lower.includes('mutfak')) return 'mutfak';
  if (lower.includes('tat')) return 'tatli';
  if (lower.includes('içecek') || lower.includes('icecek') || lower.includes('su')) return 'icecek';
  return 'mutfak';
}
