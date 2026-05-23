'use client';

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowRightLeft, Boxes, Building2, CheckSquare, Copy, Download, Layers3, Package, PackageCheck, Plus, Printer, Save, Search, Sparkles, Trash2, Upload, Warehouse } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { ProductCardForm } from '@/components/product-card-form';
import { getDailyPurchaseInvoiceCount, getDailyPurchaseInvoiceTotal, loadStoredPurchaseInvoices } from '@/lib/purchase-invoice-store';
import {
  erpIngredients,
  erpSnapshot,
  formatQuantity,
  formatTRY,
  getIngredient,
  productRecipes,
  type Ingredient,
} from '@/lib/erp-engine';
import {
  DEFAULT_SALE_PRODUCT_BASE,
  loadStoredSaleProducts,
  saveStoredSaleProducts,
  type SaleUnitType,
  type StoredSaleProduct,
  type VatRate,
} from '@/lib/sale-product-catalog';
import { isSellableProductType, type SellableProductDomainType } from '@/lib/product-domain';
import {
  coerceCategoryForProductType,
  getCategoryDomainDefinition,
  getCategoryOptionsForProductType,
  getDefaultCategoryForProductType,
  validateProductDomainGraph,
  type ExtendedProductDomainType,
} from '@/lib/product-domain-graph';
import {
  loadStoredRawIngredients,
  saveStoredRawIngredients,
} from '@/lib/raw-ingredient-store';
import {
  getStoredOrdersByTable,
  subscribeToStoredOrdersChanges,
} from '@/lib/table-payment-state';
import {
  applyRecipeOverrides,
  buildRecipeOverrides,
  getDefaultRecipePoolState,
  getLatestPublishedRecipeVersion,
  loadStoredRecipePool,
  mergeRecipePoolStates,
  saveStoredRecipePool,
  suggestRecipeTemplateId,
  type ProductRecipeOverride,
  type RecipePoolIngredientLine,
  type RecipePoolRecipe,
  type RecipePoolUnit,
  type RecipePoolVersion,
} from '@/lib/recipe-pool';
import {
  MAIN_WAREHOUSE,
  MAIN_WAREHOUSE_ID,
  executeTransfer,
  getWarehouseStock,
  loadAllWarehouseStocks,
  loadTransferRecords,
  loadWarehouses,
  saveAllWarehouseStocks,
  saveTransferRecords,
  saveWarehouses,
  type Warehouse as WarehouseModel,
  type WarehouseStockLine as WarehouseStockLineModel,
  type TransferRecord as WarehouseTransferRecord,
} from '@/lib/warehouse-store';
import {
  analyzeAlcoholVariance,
  buildInitialAlcoholState,
  clToMl,
  consumeOpenBottlePortionsOnly,
  consumePortionsFIFO,
  getActualRemainingMl,
  getPortionsPerBottle,
  type OpenBottleEntry,
} from '@/lib/alcohol-tracking';
import {
  findPrinterMappingForCategory,
  getDefaultIntegrationState,
  loadIntegrationState,
  normalizePrinterCategoryKey,
  saveIntegrationState,
  subscribeToIntegrationChanges,
  type PrinterMappingRecord,
} from '@/lib/integration-store';
import {
  bulkUpsertProductMappings,
  createAutoProductMapping,
  getProductMapping,
  loadProductMappings,
  upsertProductMapping,
  validateProductMapping,
  type PosUnitType,
  type ProductMapping,
} from '@/lib/pos-mapping-store';
import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';

const branchId = 'mrk';
const DEFAULT_PRODUCT_CATEGORIES = ['Satış Ürünleri', 'İçecekler', 'Combo', 'Hammaddeler', 'Yarı Mamüller', 'Modifier', 'Varyant', 'Kahve', 'Soğuk İçecek', 'Alkol', 'Burger', 'Et', 'Balık', 'Tavuk', 'Tatlı', 'Salata', 'Diğer'] as const;
const RAW_STOCK_COUNT_STORAGE_KEY = 'adisyon-raw-stock-counts';

type ProductWindow = 'raw' | 'sale' | 'quick' | 'bar' | 'recipe' | 'warehouse';
type CreateItemType = 'sale' | 'raw' | 'semi' | 'combo' | 'modifier' | 'variant';
type RawUnit = 'kg' | 'lt' | 'adet';
type SaleStockProcurementType = 'recipe' | 'direct';
type BarStockMode = 'none' | 'bottle-glass';

type SaleProductRecipeLine = {
  ingredientId: string;
  quantity: string;
  unit: RecipePoolUnit;
};

type SaleProductCard = {
  id: string;
  name: string;
  category: string;
  productType: SellableProductDomainType;
  salesUnit: SaleUnitType;
  currentStock: string;
  lastCountedAt?: string;
  stockProcurementType: SaleStockProcurementType;
  barStockMode: BarStockMode;
  glassesPerBottle: string;
  bottleVolumeCl: string;
  portionVolumeCl: string;
  initialBottleCount: string;
  dispensedPortions: string;
  openBottleSnapshots: OpenBottleEntry[];
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
  fixedMenu: boolean;
  happyHourEligible: boolean;
  eventPriceEligible: boolean;
  vatRate: VatRate;
  salesCount: number;
  recipeLines: SaleProductRecipeLine[];
  recipeId?: string;
  portionMultiplier: string;
  recipeOverrides: ProductRecipeOverride[];
  recipeOverride?: boolean;
  wastePercentage: string;
  operationalCost: string;
  source: 'seeded' | 'created';
};

type CreatedRawIngredient = {
  id: string;
  name: string;
  productType?: 'stock_item' | 'semi_product';
  unit: RawUnit;
  purchasePrice: string;
  minimumQuantity: string;
  currentQuantity: string;
  vatRate: VatRate;
};

type BulkDrafts = Record<'raw' | 'sale' | 'recipe', string>;
type BulkFileNames = Record<'raw' | 'sale' | 'recipe', string>;
type ImportIssue = {
  rowNumber: number;
  message: string;
  cells: string[];
};

type NewItemDraft = {
  itemType: CreateItemType;
  name: string;
  category: string;
  salesUnit: SaleUnitType;
  salePrice: string;
  purchasePrice: string;
  vatRate: VatRate;
  unit: RawUnit;
  minimumQuantity: string;
  currentQuantity: string;
};

type ProductCreationOption = {
  id: CreateItemType;
  title: string;
  subtitle: string;
  targetWindow: ProductWindow;
  icon: typeof Package;
  tone: string;
};

type QuickSaleDraft = {
  name: string;
  category: string;
  salesUnit: SaleUnitType;
  salePrice: string;
  vatRate: VatRate;
};

type IngredientPurchaseHistory = {
  ingredientId: string;
  invoiceNo: string;
  supplierName: string;
  date: string;
  quantity: number;
  unitPrice: number;
};

type RawStockCountOverride = {
  currentQuantity: string;
  lastCountedAt: string;
};

type RuntimeOrderLine = {
  name: string;
  qty: number;
  sentQty?: number;
  isReturn?: boolean;
  complimentary?: boolean;
  complimentaryReason?: string;
  price?: number;
};

type ComplimentaryReasonSummary = {
  reason: string;
  qty: number;
  estimatedRevenueLoss: number;
};

type ComplimentaryProductSummary = {
  totalQty: number;
  estimatedRevenueLoss: number;
  reasons: ComplimentaryReasonSummary[];
};

type BarAlertLevel = 'ok' | 'warning' | 'critical';

type BarDashboardAlert = {
  productId: string;
  level: BarAlertLevel;
  title: string;
  detail: string;
};

type BarDashboardItem = {
  product: SaleProductCard;
  bottleMl: number;
  sealedBottleCount: number;
  openBottleCount: number;
  actualRemainingMl: number;
  remainingPortions: number;
  salesGlasses: number;
  pendingPortions: number;
  totalConsumptionCl: number;
  variance: ReturnType<typeof analyzeAlcoholVariance>;
  stockLevel: number;
  alerts: BarDashboardAlert[];
};

type BarOpenBottleRow = {
  productId: string;
  productName: string;
  category: string;
  bottleId: string;
  openedAt: string;
  bottleMl: number;
  portionMl: number;
  remainingMl: number;
  consumedMl: number;
  remainingGlasses: number;
  consumedGlasses: number;
};

const productWindows = [
  { id: 'raw' as const, label: 'Hammaddeler', description: 'Depo ve üretim stoku', icon: Boxes },
  { id: 'sale' as const, label: 'Satış Ürünleri', description: 'Ürün kartı ve reçete', icon: Package },
  { id: 'quick' as const, label: 'Product Studio', description: 'Domain bazlı oluşturma', icon: Plus },
  { id: 'bar' as const, label: 'Bar Kontrol', description: 'Açık şişe ve varyans takibi', icon: Sparkles },
  { id: 'recipe' as const, label: 'Reçete Havuzu', description: 'Merkezi reçete yönetimi', icon: Layers3 },
  { id: 'warehouse' as const, label: 'Depo Transfer', description: 'Ana depo ve departman sevkleri', icon: Warehouse },
];

const productCreationOptions: ProductCreationOption[] = [
  {
    id: 'raw',
    title: 'Hammadde',
    subtitle: 'Sadece stok, reçete ve satın alma akışında kullanılır.',
    targetWindow: 'raw',
    icon: Boxes,
    tone: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  },
  {
    id: 'sale',
    title: 'Satış Ürünü',
    subtitle: 'POS, adisyon, QR menü ve online satışta görünür.',
    targetWindow: 'sale',
    icon: Package,
    tone: 'border-blue-400/25 bg-blue-500/10 text-blue-100',
  },
  {
    id: 'semi',
    title: 'Yarı Mamül',
    subtitle: 'Sos, hamur, marinasyon gibi reçetede kullanılan ara üretim.',
    targetWindow: 'raw',
    icon: PackageCheck,
    tone: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  },
  {
    id: 'combo',
    title: 'Combo',
    subtitle: 'Birden fazla satış ürününü tek POS kartında birleştirir.',
    targetWindow: 'sale',
    icon: Copy,
    tone: 'border-violet-400/25 bg-violet-500/10 text-violet-100',
  },
  {
    id: 'modifier',
    title: 'Modifier',
    subtitle: 'Ekstra, çıkarılacak içerik ve opsiyon grupları.',
    targetWindow: 'quick',
    icon: CheckSquare,
    tone: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100',
  },
  {
    id: 'variant',
    title: 'Varyant',
    subtitle: 'Boy, porsiyon, gramaj veya fiyat varyasyonları.',
    targetWindow: 'quick',
    icon: ArrowRightLeft,
    tone: 'border-slate-400/25 bg-slate-500/10 text-slate-100',
  },
];

const ingredientPurchaseHistory: IngredientPurchaseHistory[] = [
  { ingredientId: 'coffee-bean', invoiceNo: 'AF-2026-1711', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-12', quantity: 10, unitPrice: 468 },
  { ingredientId: 'coffee-bean', invoiceNo: 'AF-2026-1776', supplierName: 'Gurme Gıda Tedarik', date: '2026-03-08', quantity: 12, unitPrice: 492 },
  { ingredientId: 'coffee-bean', invoiceNo: 'AF-2026-1842', supplierName: 'Gurme Gıda Tedarik', date: '2026-04-15', quantity: 8, unitPrice: 520 },
  { ingredientId: 'milk', invoiceNo: 'AF-2026-1689', supplierName: 'Süt Ürünleri AŞ', date: '2026-02-05', quantity: 18, unitPrice: 35 },
  { ingredientId: 'milk', invoiceNo: 'AF-2026-1762', supplierName: 'Süt Ürünleri AŞ', date: '2026-03-04', quantity: 20, unitPrice: 39 },
  { ingredientId: 'milk', invoiceNo: 'AF-2026-1842', supplierName: 'Gurme Gıda Tedarik', date: '2026-04-15', quantity: 16, unitPrice: 42 },
  { ingredientId: 'burger-bun', invoiceNo: 'AF-2026-1704', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-18', quantity: 100, unitPrice: 15 },
  { ingredientId: 'burger-bun', invoiceNo: 'AF-2026-1788', supplierName: 'Gurme Gıda Tedarik', date: '2026-03-15', quantity: 120, unitPrice: 16.5 },
  { ingredientId: 'burger-bun', invoiceNo: 'AF-2026-1842', supplierName: 'Gurme Gıda Tedarik', date: '2026-04-15', quantity: 80, unitPrice: 18 },
  { ingredientId: 'burger-patty', invoiceNo: 'AF-2026-1661', supplierName: 'Gurme Gıda Tedarik', date: '2026-01-28', quantity: 60, unitPrice: 58 },
  { ingredientId: 'burger-patty', invoiceNo: 'AF-2026-1741', supplierName: 'Gurme Gıda Tedarik', date: '2026-03-01', quantity: 80, unitPrice: 61 },
  { ingredientId: 'truffle-sauce', invoiceNo: 'AF-2026-1650', supplierName: 'Gurme Gıda Tedarik', date: '2026-01-20', quantity: 4, unitPrice: 290 },
  { ingredientId: 'truffle-sauce', invoiceNo: 'AF-2026-1724', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-24', quantity: 3, unitPrice: 315 },
  { ingredientId: 'sparkling-water', invoiceNo: 'AF-2026-1698', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-14', quantity: 96, unitPrice: 16 },
  { ingredientId: 'sparkling-water', invoiceNo: 'AF-2026-1799', supplierName: 'Gurme Gıda Tedarik', date: '2026-03-22', quantity: 72, unitPrice: 18 },
  { ingredientId: 'lettuce', invoiceNo: 'AF-2026-1718', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-20', quantity: 12, unitPrice: 24 },
  { ingredientId: 'orange', invoiceNo: 'AF-2026-1736', supplierName: 'Gurme Gıda Tedarik', date: '2026-02-27', quantity: 14, unitPrice: 29 },
];

const ingredientUsageMetrics: Record<string, { last30DaysUsage: number; avgDailyUsage: number }> = {
  'coffee-bean': { last30DaysUsage: 8.4, avgDailyUsage: 0.28 },
  milk: { last30DaysUsage: 46, avgDailyUsage: 1.53 },
  'burger-bun': { last30DaysUsage: 96, avgDailyUsage: 3.2 },
  'burger-patty': { last30DaysUsage: 88, avgDailyUsage: 2.93 },
  'truffle-sauce': { last30DaysUsage: 9, avgDailyUsage: 0.3 },
  'sparkling-water': { last30DaysUsage: 72, avgDailyUsage: 2.4 },
  lettuce: { last30DaysUsage: 18, avgDailyUsage: 0.6 },
  orange: { last30DaysUsage: 31, avgDailyUsage: 1.03 },
};

function splitBulkLine(line: string) {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (line.includes(';')) return line.split(';').map((cell) => cell.trim());
  if (line.includes(',')) return line.split(',').map((cell) => cell.trim());
  return [line.trim()];
}

function parseBulkPaste(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitBulkLine)
    .filter((cells) => cells.some(Boolean));
}

function stripBulkHeader(rows: string[][], windowType: ProductWindow) {
  if (rows.length === 0) return rows;

  const header = rows[0].map((cell) => cell.trim().toLocaleLowerCase('tr-TR'));
  const expected =
    windowType === 'raw'
      ? ['kart adı', 'birim', 'alış fiyatı', 'minimum stok', 'mevcut stok']
      : ['kart adı', 'kategori', 'satış fiyatı'];

  const isHeader = expected.every((value, index) => (header[index] ?? '') === value);
  return isHeader ? rows.slice(1) : rows;
}

function normalizeRawUnit(unit: string) {
  const lower = unit.trim().toLocaleLowerCase('tr-TR');
  if (lower === 'kg' || lower === 'kilogram') return { unit: 'kg' as const, multiplier: 1 };
  if (lower === 'gr' || lower === 'gram') return { unit: 'kg' as const, multiplier: 0.001 };
  if (lower === 'lt' || lower === 'l' || lower === 'litre' || lower === 'litre') return { unit: 'lt' as const, multiplier: 1 };
  if (lower === 'ml') return { unit: 'lt' as const, multiplier: 0.001 };
  return { unit: 'adet' as const, multiplier: 1 };
}

function stockStateLabel(quantity: number, minimumQuantity: number) {
  if (quantity <= minimumQuantity) return 'Kritik';
  if (quantity <= minimumQuantity * 1.25) return 'Takip';
  return 'Sağlıklı';
}

function inferCategory(productName: string) {
  const lower = productName.toLocaleLowerCase('tr');
  if (['alkol', 'bira', 'şarap', 'sarap', 'viski', 'vodka', 'cin', 'gin', 'rakı', 'raki', 'tekila', 'tequila', 'likör', 'likor'].some((keyword) => lower.includes(keyword))) return 'Alkol';
  if (lower.includes('latte') || lower.includes('espresso') || lower.includes('cappuccino')) return 'Kahve';
  if (lower.includes('burger')) return 'Burger';
  if (lower.includes('et') || lower.includes('bonfile') || lower.includes('antrikot') || lower.includes('köfte')) return 'Et';
  if (lower.includes('balık') || lower.includes('levrek') || lower.includes('çupra') || lower.includes('somon')) return 'Balık';
  if (lower.includes('tavuk') || lower.includes('chicken')) return 'Tavuk';
  if (lower.includes('tiramisu') || lower.includes('tatlı')) return 'Tatlı';
  if (lower.includes('salata')) return 'Salata';
  if (lower.includes('su') || lower.includes('meyve')) return 'Soğuk İçecek';
  return 'Diğer';
}

function productTypeForCreateItemType(itemType: CreateItemType): ExtendedProductDomainType {
  if (itemType === 'raw') return 'stock_item';
  if (itemType === 'semi') return 'semi_product';
  if (itemType === 'combo') return 'combo_product';
  if (itemType === 'modifier') return 'modifier';
  if (itemType === 'variant') return 'variant';
  return 'sale_product';
}

function inferDirectStockDefault(productName: string, category: string) {
  const value = `${productName} ${category}`.toLocaleLowerCase('tr-TR');
  return ['alkol', 'bira', 'şarap', 'sarap', 'viski', 'vodka', 'cin', 'gin', 'rakı', 'raki', 'tekila', 'tequila', 'likör', 'likor', 'kola'].some((keyword) => value.includes(keyword));
}

function inferBarBottleGlassDefault(productName: string, category: string) {
  const value = `${productName} ${category}`.toLocaleLowerCase('tr-TR');
  return ['alkol', 'bira', 'şarap', 'sarap', 'viski', 'vodka', 'cin', 'gin', 'rakı', 'raki', 'tekila', 'tequila', 'likör', 'likor'].some((keyword) => value.includes(keyword));
}

function isAlcoholCategory(value: string) {
  return value.toLocaleLowerCase('tr-TR').includes('alkol');
}

function isBarLinkedProduct(product: SaleProductCard) {
  return product.stockProcurementType === 'direct'
    && product.barStockMode === 'bottle-glass'
    && (isAlcoholCategory(product.category.trim()) || product.salesUnit === 'glass');
}

function getSaleWarehouseItemId(productId: string) {
  return `sale-product:${productId}`;
}

function isSaleWarehouseItemId(itemId: string) {
  return itemId.startsWith('sale-product:');
}

function getSaleProductIdFromWarehouseItemId(itemId: string) {
  return itemId.replace('sale-product:', '');
}

function getSaleProductWarehouseUnit(product: SaleProductCard): RawUnit {
  return product.salesUnit === 'kg' ? 'kg' : 'adet';
}

function getRuntimeOrderEffectiveQty(line: RuntimeOrderLine) {
  // Complimentary items are free for price, but they still consume stock.
  const baseQty = Math.max(0, Number(line.sentQty ?? 0)) > 0
    ? Math.max(0, Number(line.sentQty ?? 0))
    : Math.max(0, Number(line.qty ?? 0));
  return line.isReturn ? -baseQty : baseQty;
}

function buildSalesCountMapFromOrders(ordersByTable: Record<string, RuntimeOrderLine[]>) {
  const counts = new Map<string, number>();

  Object.values(ordersByTable).forEach((lines) => {
    lines.forEach((line) => {
      const name = String(line.name ?? '').trim();
      if (!name) return;
      const qty = getRuntimeOrderEffectiveQty(line);
      counts.set(name, Math.max(0, (counts.get(name) ?? 0) + qty));
    });
  });

  return counts;
}

function buildComplimentarySummaryMapFromOrders(ordersByTable: Record<string, RuntimeOrderLine[]>) {
  const productSummary = new Map<string, ComplimentaryProductSummary>();

  Object.values(ordersByTable).forEach((lines) => {
    lines.forEach((line) => {
      if (!line.complimentary || line.isReturn) return;

      const name = String(line.name ?? '').trim();
      if (!name) return;

      const qty = Math.max(0, getRuntimeOrderEffectiveQty({ ...line, isReturn: false }));
      if (qty <= 0) return;

      const reason = String(line.complimentaryReason ?? '').trim() || 'Sebep girilmedi';
      const estimatedRevenueLoss = qty * Math.max(0, Number(line.price ?? 0));
      const current = productSummary.get(name) ?? { totalQty: 0, estimatedRevenueLoss: 0, reasons: [] };
      const existingReason = current.reasons.find((item) => item.reason === reason);

      current.totalQty += qty;
      current.estimatedRevenueLoss += estimatedRevenueLoss;

      if (existingReason) {
        existingReason.qty += qty;
        existingReason.estimatedRevenueLoss += estimatedRevenueLoss;
      } else {
        current.reasons.push({ reason, qty, estimatedRevenueLoss });
      }

      current.reasons.sort((a, b) => b.qty - a.qty);
      productSummary.set(name, current);
    });
  });

  return productSummary;
}

function getBarAlertTone(level: BarAlertLevel) {
  if (level === 'critical') return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  if (level === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function buildBarDashboardAlerts(item: Omit<BarDashboardItem, 'alerts'>): BarDashboardAlert[] {
  const alerts: BarDashboardAlert[] = [];
  const varianceCl = item.variance.varianceMl / 10;

  if (item.pendingPortions > 0) {
    alerts.push({
      productId: item.product.id,
      level: 'critical',
      title: 'Manuel şişe açılması gerekli',
      detail: `${item.pendingPortions.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kadeh için açık şişe bulunmuyor.`,
    });
  }

  if (item.variance.varianceMl < 0 && item.variance.status !== 'ok') {
    alerts.push({
      productId: item.product.id,
      level: item.variance.status === 'critical' ? 'critical' : 'warning',
      title: 'Aşırı tüketim',
      detail: `Beklenenden ${Math.abs(varianceCl).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cl daha az stok görünüyor.`,
    });
  }

  if (item.stockLevel <= 1.5) {
    alerts.push({
      productId: item.product.id,
      level: item.stockLevel <= 0.75 ? 'critical' : 'warning',
      title: 'Düşük stok',
      detail: `Yaklaşık ${item.stockLevel.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} şişe kaldı.`,
    });
  }

  if (item.openBottleCount >= 3 || (item.salesGlasses === 0 && item.openBottleCount > 0)) {
    alerts.push({
      productId: item.product.id,
      level: 'warning',
      title: 'Anormal kullanım',
      detail: item.salesGlasses === 0
        ? 'Satış yokken açık şişe görünüyor.'
        : `${item.openBottleCount} açık şişe eş zamanlı takipte.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      productId: item.product.id,
      level: 'ok',
      title: 'Kontrol altında',
      detail: 'Bar akışı normal.',
    });
  }

  return alerts;
}

function getDirectProductWarehouseQuantity(product: SaleProductCard) {
  const sealed = Math.max(0, parseAmount(product.currentStock));
  if (product.stockProcurementType !== 'direct' || product.barStockMode !== 'bottle-glass') {
    return sealed;
  }

  const bottleMl = clToMl(parseAmount(product.bottleVolumeCl || '70'));
  if (bottleMl <= 0) return sealed;
  const openMl = (product.openBottleSnapshots ?? []).reduce((sum, item) => sum + Math.max(0, item.remainingMl), 0);
  return sealed + (openMl / bottleMl);
}

function formatSaleUnitLabel(value: SaleUnitType) {
  if (value === 'kg') return 'Kg bazlı';
  if (value === 'bottle') return 'Şişe bazlı';
  if (value === 'glass') return 'Kadeh bazlı';
  return 'Porsiyon bazlı';
}

function getSaleStockUnitLabel(value: SaleUnitType) {
  if (value === 'kg') return 'kg';
  if (value === 'bottle') return 'şişe';
  if (value === 'glass') return 'kadeh';
  return 'porsiyon';
}

function formatSaleStockQuantity(value: number, salesUnit: SaleUnitType) {
  return `${value.toLocaleString('tr-TR', {
    minimumFractionDigits: salesUnit === 'kg' && value % 1 !== 0 ? 3 : 0,
    maximumFractionDigits: salesUnit === 'kg' ? 3 : 0,
  })} ${getSaleStockUnitLabel(salesUnit)}`;
}

function formatProductStockQuantity(product: SaleProductCard, value: number) {
  if (product.stockProcurementType === 'direct' && product.barStockMode === 'bottle-glass') {
    return `${value.toLocaleString('tr-TR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0, maximumFractionDigits: 3 })} şişe`;
  }
  return formatSaleStockQuantity(value, product.salesUnit);
}

function formatCountTimestamp(value?: string) {
  if (!value) return 'Henüz sayım yok';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Henüz sayım yok';
  return parsed.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeWarehouseUnit(unit: Ingredient['unit'] | RawUnit): RawUnit {
  if (unit === 'kg' || unit === 'gr') return 'kg';
  if (unit === 'lt' || unit === 'ml') return 'lt';
  return 'adet';
}

function formatWarehouseTransferDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadRawStockCountOverrides() {
  if (typeof window === 'undefined') return {} as Record<string, RawStockCountOverride>;

  try {
    const raw = readRuntimeItem('tenant', RAW_STOCK_COUNT_STORAGE_KEY);
    if (!raw) return {} as Record<string, RawStockCountOverride>;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {} as Record<string, RawStockCountOverride>;

    return Object.entries(parsed).reduce<Record<string, RawStockCountOverride>>((acc, [key, value]) => {
      if (!value || typeof value !== 'object') return acc;

      const currentQuantity = 'currentQuantity' in value ? String(value.currentQuantity ?? '0') : '0';
      const lastCountedAt = 'lastCountedAt' in value ? String(value.lastCountedAt ?? '') : '';
      acc[key] = { currentQuantity, lastCountedAt };
      return acc;
    }, {});
  } catch {
    return {} as Record<string, RawStockCountOverride>;
  }
}

function saveRawStockCountOverrides(overrides: Record<string, RawStockCountOverride>) {
  if (typeof window === 'undefined') return;

  try {
    writeRuntimeItem('tenant', RAW_STOCK_COUNT_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors in demo env
  }
}

function parseAmount(value: string) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTimeHHmm(value: string) {
  if (!value) return false;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function convertToIngredientBaseUnit(quantity: number, fromUnit: Ingredient['unit'], ingredientUnit: Ingredient['unit']) {
  if (fromUnit === ingredientUnit) return quantity;

  if (ingredientUnit === 'kg' && fromUnit === 'gr') return quantity / 1000;
  if (ingredientUnit === 'gr' && fromUnit === 'kg') return quantity * 1000;
  if (ingredientUnit === 'lt' && fromUnit === 'ml') return quantity / 1000;
  if (ingredientUnit === 'ml' && fromUnit === 'lt') return quantity * 1000;

  return quantity;
}

function getCompatibleUnits(unit: Ingredient['unit']) {
  if (unit === 'kg' || unit === 'gr') return ['kg', 'gr'] as const;
  if (unit === 'lt' || unit === 'ml') return ['lt', 'ml'] as const;
  return ['adet'] as const;
}

function buildInitialSaleProducts(storedProducts: StoredSaleProduct[] | null) {
  const sellableStoredProducts = (storedProducts ?? []).filter((product) => isSellableProductType(product.productType));
  const storedByName = new Map(sellableStoredProducts.map((product) => [product.name, product]));
  const baseByName = new Map(DEFAULT_SALE_PRODUCT_BASE.map((product) => [product.name, product]));
  const recipeProductNames = new Set(productRecipes.map((recipe) => recipe.productName));

  const recipeBasedProducts = productRecipes.map((recipe) => {
    const estimatedCost = recipe.ingredients.reduce((sum, line) => {
      const stock = erpSnapshot.invoiceStockResult.stocks.find((item) => item.branchId === branchId && item.ingredientId === line.ingredientId);
      return sum + (stock?.averageCost ?? 0) * line.quantity;
    }, 0);
    const stored = storedByName.get(recipe.productName);
    const base = baseByName.get(recipe.productName);
    const category = stored?.category ?? base?.category ?? inferCategory(recipe.productName);
    const defaultDirect = inferDirectStockDefault(recipe.productName, category);
    const defaultBottleMode = inferBarBottleGlassDefault(recipe.productName, category);
    const suggestedRecipeId = suggestRecipeTemplateId(recipe.productName, category);

    return {
      id: stored?.id ?? recipe.productName,
      name: stored?.name ?? recipe.productName,
      category,
      productType: (stored?.productType === 'combo_product' ? 'combo_product' : 'sale_product') as SellableProductDomainType,
      salesUnit: stored?.salesUnit ?? 'portion',
      currentStock: stored?.currentStock ?? '0',
      lastCountedAt: stored?.lastCountedAt,
      stockProcurementType: stored?.stockProcurementType ?? (defaultDirect ? 'direct' : 'recipe'),
      barStockMode: stored?.barStockMode ?? (defaultBottleMode ? 'bottle-glass' : 'none'),
      glassesPerBottle: stored?.glassesPerBottle ?? '6',
      bottleVolumeCl: stored?.bottleVolumeCl ?? '70',
      portionVolumeCl: stored?.portionVolumeCl ?? '5',
      initialBottleCount: stored?.initialBottleCount ?? String(Math.max(0, parseAmount(stored?.currentStock ?? '0'))),
      dispensedPortions: stored?.dispensedPortions ?? '0',
      openBottleSnapshots: (stored?.openBottleSnapshots ?? []).map((item) => ({
        id: item.id,
        openedAt: item.openedAt,
        remainingMl: Math.max(0, Number(item.remainingMl) || 0),
      })),
      salePrice: stored?.salePrice ?? base?.salePrice ?? String(Math.round(estimatedCost * 2.35)),
      salePrice1: stored?.salePrice1 ?? stored?.salePrice ?? base?.salePrice ?? String(Math.round(estimatedCost * 2.35)),
      salePrice2: stored?.salePrice2 ?? stored?.salePrice1 ?? stored?.salePrice ?? base?.salePrice ?? String(Math.round(estimatedCost * 2.35)),
      salePrice3: stored?.salePrice3 ?? stored?.salePrice1 ?? stored?.salePrice ?? base?.salePrice ?? String(Math.round(estimatedCost * 2.35)),
      price1WindowEnabled: stored?.price1WindowEnabled ?? true,
      price1Start: stored?.price1Start ?? '',
      price1End: stored?.price1End ?? '',
      price2WindowEnabled: stored?.price2WindowEnabled ?? false,
      price2Start: stored?.price2Start ?? '',
      price2End: stored?.price2End ?? '',
      allowComplimentary: stored?.allowComplimentary ?? true,
      allowDiscount: stored?.allowDiscount ?? true,
      fixedMenu: stored?.fixedMenu ?? false,
      happyHourEligible: stored?.happyHourEligible ?? true,
      eventPriceEligible: stored?.eventPriceEligible ?? true,
      vatRate: stored?.vatRate ?? base?.vatRate ?? 10,
      salesCount: stored?.salesCount ?? 0,
      recipeLines:
        stored?.recipeLines?.length
          ? stored.recipeLines.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit ?? getIngredient(line.ingredientId)?.unit ?? 'adet',
            }))
          : recipe.ingredients.map((line) => ({
              ingredientId: line.ingredientId,
              quantity: String(line.quantity),
              unit: getIngredient(line.ingredientId)?.unit ?? 'adet',
            })),
      recipeId: stored?.recipeId ?? suggestedRecipeId,
      portionMultiplier: stored?.portionMultiplier ?? '1',
      recipeOverrides: stored?.recipeOverrides ?? [],
      recipeOverride: stored?.recipeOverride ?? false,
      wastePercentage: stored?.wastePercentage ?? '0',
      operationalCost: stored?.operationalCost ?? '0',
      source: stored ? 'seeded' as const : 'seeded' as const,
    };
  });

  const storedOnlyProducts = sellableStoredProducts
    .filter((stored) => !recipeProductNames.has(stored.name))
    .map((stored) => {
      const defaultDirect = inferDirectStockDefault(stored.name, stored.category);
      const defaultBottleMode = inferBarBottleGlassDefault(stored.name, stored.category);

      return {
        id: stored.id,
        name: stored.name,
        category: stored.category,
        productType: (stored.productType === 'combo_product' ? 'combo_product' : 'sale_product') as SellableProductDomainType,
        salesUnit: stored.salesUnit ?? 'portion',
        currentStock: stored.currentStock ?? '0',
        lastCountedAt: stored.lastCountedAt,
        stockProcurementType: stored.stockProcurementType ?? ((stored.salesUnit === 'glass' || defaultDirect) ? 'direct' : 'recipe'),
        barStockMode: stored.barStockMode ?? ((stored.salesUnit === 'glass' || defaultBottleMode) ? 'bottle-glass' : 'none'),
        glassesPerBottle: stored.glassesPerBottle ?? '6',
        bottleVolumeCl: stored.bottleVolumeCl ?? '70',
        portionVolumeCl: stored.portionVolumeCl ?? '5',
        initialBottleCount: stored.initialBottleCount ?? String(Math.max(0, parseAmount(stored.currentStock ?? '0'))),
        dispensedPortions: stored.dispensedPortions ?? '0',
        openBottleSnapshots: (stored.openBottleSnapshots ?? []).map((item) => ({
          id: item.id,
          openedAt: item.openedAt,
          remainingMl: Math.max(0, Number(item.remainingMl) || 0),
        })),
        salePrice: stored.salePrice,
        salePrice1: stored.salePrice1 ?? stored.salePrice,
        salePrice2: stored.salePrice2 ?? stored.salePrice1 ?? stored.salePrice,
        salePrice3: stored.salePrice3 ?? stored.salePrice1 ?? stored.salePrice,
        price1WindowEnabled: stored.price1WindowEnabled ?? true,
        price1Start: stored.price1Start ?? '',
        price1End: stored.price1End ?? '',
        price2WindowEnabled: stored.price2WindowEnabled ?? false,
        price2Start: stored.price2Start ?? '',
        price2End: stored.price2End ?? '',
        allowComplimentary: stored.allowComplimentary ?? true,
        allowDiscount: stored.allowDiscount ?? true,
        fixedMenu: stored.fixedMenu ?? false,
        happyHourEligible: stored.happyHourEligible ?? true,
        eventPriceEligible: stored.eventPriceEligible ?? true,
        vatRate: stored.vatRate ?? 10,
        salesCount: stored.salesCount ?? 0,
        recipeLines: (stored.recipeLines ?? []).map((line) => ({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit ?? getIngredient(line.ingredientId)?.unit ?? 'adet',
        })),
        recipeId: stored.recipeId,
        portionMultiplier: stored.portionMultiplier ?? '1',
        recipeOverrides: stored.recipeOverrides ?? [],
        recipeOverride: stored.recipeOverride ?? false,
        wastePercentage: stored.wastePercentage ?? '0',
        operationalCost: stored.operationalCost ?? '0',
        source: stored.source ?? 'created' as const,
      };
    });

  return [...storedOnlyProducts, ...recipeBasedProducts];
}

function createInitialRecipePoolState(
  products: SaleProductCard[],
  storedPool?: { recipes: RecipePoolRecipe[]; versions: RecipePoolVersion[] } | null,
) {
  const defaultPool = getDefaultRecipePoolState();

  const recipes: RecipePoolRecipe[] = [];
  const versions: RecipePoolVersion[] = [];

  products.forEach((product, index) => {
    if (product.recipeLines.length === 0 || product.recipeId) return;

    const recipeId = `recipe-${product.id}-${index + 1}`;
    recipes.push({
      id: recipeId,
      name: `${product.category} / ${product.name}`,
      category: product.category,
      status: 'active',
    });
    versions.push({
      id: `recipe-version-${recipeId}-1`,
      recipeId,
      versionNo: 1,
      published: true,
      ingredients: product.recipeLines.map((line) => ({
        ingredientId: line.ingredientId,
        qty: line.quantity,
        unit: line.unit,
      })),
    });
  });

  return mergeRecipePoolStates(defaultPool, { recipes, versions }, storedPool ?? null);
}

const SERVER_INITIAL_SALE_PRODUCTS = buildInitialSaleProducts(null).map((product, index) => ({
  ...product,
  recipeId: product.recipeId ?? (product.recipeLines.length > 0 ? `recipe-${product.id}-${index + 1}` : undefined),
}));

const SERVER_INITIAL_RECIPE_POOL = createInitialRecipePoolState(SERVER_INITIAL_SALE_PRODUCTS, null);

function getProductBaseRecipeLines(product: SaleProductCard, versions: RecipePoolVersion[]) {
  const publishedVersion = getLatestPublishedRecipeVersion(product.recipeId, versions);
  if (publishedVersion) {
    return publishedVersion.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: line.qty,
      unit: line.unit,
    }));
  }

  return product.recipeLines;
}

function getProductEffectiveRecipeLines(product: SaleProductCard, versions: RecipePoolVersion[]) {
  const publishedVersion = getLatestPublishedRecipeVersion(product.recipeId, versions);
  if (!publishedVersion) {
    return product.recipeLines;
  }

  return applyRecipeOverrides(publishedVersion.ingredients, product.recipeOverrides).map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.qty,
    unit: line.unit,
  }));
}

function inferRecipeSuggestions(productName: string, category: string, ingredientOptions: Array<{ id: string; name: string; unit: Ingredient['unit'] }>) {
  const lowerName = productName.toLocaleLowerCase('tr-TR');
  const lowerCategory = category.toLocaleLowerCase('tr-TR');

  const rules = [
    {
      when: ['latte', 'kahve'],
      picks: ['Kahve Çekirdeği', 'Süt'],
    },
    {
      when: ['espresso'],
      picks: ['Kahve Çekirdeği'],
    },
    {
      when: ['cappuccino'],
      picks: ['Kahve Çekirdeği', 'Süt'],
    },
    {
      when: ['burger'],
      picks: ['Burger Köftesi', 'Burger Ekmeği', 'Trüf Sos'],
    },
    {
      when: ['salata'],
      picks: ['Marul'],
    },
    {
      when: ['meyve', 'soğuk içecek', 'icecek'],
      picks: ['Portakal', 'Maden Suyu'],
    },
    {
      when: ['tatlı', 'tiramisu'],
      picks: ['Tatlı Bazı'],
    },
  ];

  const activeRule = rules.find((rule) =>
    rule.when.some((keyword) => lowerName.includes(keyword) || lowerCategory.includes(keyword)),
  );

  if (!activeRule) return [];

  return activeRule.picks
    .map((name) => ingredientOptions.find((ingredient) => ingredient.name === name))
    .filter((ingredient): ingredient is { id: string; name: string; unit: Ingredient['unit'] } => Boolean(ingredient));
}

function findExactPrinterMapping(category: string, mappings: PrinterMappingRecord[]) {
  const key = normalizePrinterCategoryKey(category);
  return mappings.find((mapping) => normalizePrinterCategoryKey(mapping.category) === key) ?? null;
}

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const quickCreateFileInputRef = useRef<HTMLInputElement | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [activeWindow, setActiveWindow] = useState<ProductWindow>('raw');
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [integrationState, setIntegrationState] = useState(() => getDefaultIntegrationState());
  const [categories, setCategories] = useState<string[]>([...DEFAULT_PRODUCT_CATEGORIES]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [bulkDrafts, setBulkDrafts] = useState<BulkDrafts>({ raw: '', sale: '', recipe: '' });
  const [bulkFileNames, setBulkFileNames] = useState<BulkFileNames>({ raw: '', sale: '', recipe: '' });
  const [recipePool, setRecipePool] = useState<RecipePoolRecipe[]>(SERVER_INITIAL_RECIPE_POOL.recipes);
  const [recipeVersions, setRecipeVersions] = useState<RecipePoolVersion[]>(SERVER_INITIAL_RECIPE_POOL.versions);
  const [dailyPurchaseInvoiceTotal, setDailyPurchaseInvoiceTotal] = useState(0);
  const [dailyPurchaseInvoiceCount, setDailyPurchaseInvoiceCount] = useState(0);
  const [newItemDraft, setNewItemDraft] = useState<NewItemDraft>({
    itemType: 'sale',
    name: '',
    category: DEFAULT_PRODUCT_CATEGORIES[0],
    salesUnit: 'portion',
    salePrice: '0',
    purchasePrice: '0',
    vatRate: 10,
    unit: 'adet',
    minimumQuantity: '0',
    currentQuantity: '0',
  });
  const [createdRawIngredients, setCreatedRawIngredients] = useState<CreatedRawIngredient[]>([]);
  const [rawCountOverrides, setRawCountOverrides] = useState<Record<string, RawStockCountOverride>>({});
  const [saleProducts, setSaleProducts] = useState<SaleProductCard[]>(SERVER_INITIAL_SALE_PRODUCTS);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [mappingDraft, setMappingDraft] = useState({ pos_plu_code: '', vat_rate: '10', unit_type: 'porsiyon' as PosUnitType });
  const [bulkMappingDraft, setBulkMappingDraft] = useState('');
  const [mappingMessage, setMappingMessage] = useState('');
  const [selectedRawId, setSelectedRawId] = useState<string>(erpIngredients[0].id ?? '');
  const [rawSearch, setRawSearch] = useState('');
  const [saleProductSearch, setSaleProductSearch] = useState('');
  const [quickPriceSearch, setQuickPriceSearch] = useState('');
  const [quickListMode, setQuickListMode] = useState<'add' | 'price'>('add');
  const [quickSaleDraft, setQuickSaleDraft] = useState<QuickSaleDraft>({
    name: '',
    category: DEFAULT_PRODUCT_CATEGORIES[0],
    salesUnit: 'portion' as SaleUnitType,
    salePrice: '0',
    vatRate: 10 as VatRate,
  });
  const [quickDuplicateSourceId, setQuickDuplicateSourceId] = useState('');
  const [quickDuplicateMode, setQuickDuplicateMode] = useState<'full' | 'price-only'>('full');
  const [quickDuplicateWithRecipe, setQuickDuplicateWithRecipe] = useState(true);
  const [quickPriceDrafts, setQuickPriceDrafts] = useState<Record<string, string>>({});
  const [rawCountInput, setRawCountInput] = useState('0');
  const [selectedProductId, setSelectedProductId] = useState<string>(SERVER_INITIAL_SALE_PRODUCTS[0]?.id ?? '');
  const [saleCountInput, setSaleCountInput] = useState('0');
  const [selectedPoolRecipeId, setSelectedPoolRecipeId] = useState<string>(SERVER_INITIAL_RECIPE_POOL.recipes[0]?.id ?? '');
  const [selectedPoolRecipeIds, setSelectedPoolRecipeIds] = useState<string[]>([]);
  const [selectedRecipeCategory, setSelectedRecipeCategory] = useState('Tümü');
  const [poolDraftLines, setPoolDraftLines] = useState<RecipePoolIngredientLine[]>([]);
  const [newRecipeIngredientId, setNewRecipeIngredientId] = useState('');
  const [newRecipeIngredientQuery, setNewRecipeIngredientQuery] = useState('');
  const [newRecipeQuantity, setNewRecipeQuantity] = useState('1');
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseModel[]>([MAIN_WAREHOUSE]);
  const [warehouseStocks, setWarehouseStocks] = useState<Record<string, WarehouseStockLineModel[]>>({});
  const [warehouseTransfers, setWarehouseTransfers] = useState<WarehouseTransferRecord[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(MAIN_WAREHOUSE_ID);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [transferFromWarehouseId, setTransferFromWarehouseId] = useState(MAIN_WAREHOUSE_ID);
  const [transferToWarehouseId, setTransferToWarehouseId] = useState('');
  const [transferIngredientId, setTransferIngredientId] = useState('');
  const [transferIngredientSearch, setTransferIngredientSearch] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferCountInput, setTransferCountInput] = useState('');
  const [transferDeliveredBy, setTransferDeliveredBy] = useState('');
  const [transferReceivedBy, setTransferReceivedBy] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [warehouseTransferMessage, setWarehouseTransferMessage] = useState('');
  const [warehouseTransferError, setWarehouseTransferError] = useState('');
  const [runtimeOrdersByTable, setRuntimeOrdersByTable] = useState<Record<string, RuntimeOrderLine[]>>({});
  const [selectedBarProductId, setSelectedBarProductId] = useState('');
  const [barActionProductId, setBarActionProductId] = useState('');
  const [barActionProductQuery, setBarActionProductQuery] = useState('');
  const [selectedBarBottleId, setSelectedBarBottleId] = useState('');
  const [barOpenBottleCount, setBarOpenBottleCount] = useState('1');
  const [barManualSealedCount, setBarManualSealedCount] = useState('0');
  const [barManualBottleRemainingCl, setBarManualBottleRemainingCl] = useState('0');
  const [barStockCheckInput, setBarStockCheckInput] = useState('0');
  const [barControlMessage, setBarControlMessage] = useState('');
  const deferredRawSearch = useDeferredValue(rawSearch);
  const deferredSaleProductSearch = useDeferredValue(saleProductSearch);
  const deferredRecipeIngredientQuery = useDeferredValue(newRecipeIngredientQuery);
  const deferredBarActionProductQuery = useDeferredValue(barActionProductQuery);
  const quickCreateEnabled = activeWindow === 'raw';
  const activeCreationOption = productCreationOptions.find((option) => option.id === newItemDraft.itemType) ?? productCreationOptions[1];
  const activeDraftProductType = productTypeForCreateItemType(newItemDraft.itemType);
  const activeDraftCategoryOptions = useMemo(
    () => getCategoryOptionsForProductType(categories, activeDraftProductType),
    [activeDraftProductType, categories],
  );
  const selectedDraftCategoryDefinition = useMemo(
    () => getCategoryDomainDefinition(newItemDraft.category),
    [newItemDraft.category],
  );
  const selectedDraftDomainValidation = useMemo(
    () => validateProductDomainGraph({
      name: newItemDraft.name || 'Taslak',
      category: newItemDraft.category,
      productType: activeDraftProductType,
      price: newItemDraft.salePrice,
    }),
    [activeDraftProductType, newItemDraft.category, newItemDraft.name, newItemDraft.salePrice],
  );
  const importWindow: 'raw' = 'raw';
  const deferredQuickCreateText = useDeferredValue(quickCreateEnabled ? bulkDrafts[importWindow] : '');

  useEffect(() => {
    const domain = searchParams.get('domain');
    if (domain === 'stock_item') changeActiveWindow('raw');
    if (domain === 'sale_product') changeActiveWindow('sale');
    if (domain === 'semi_product') openProductCreationStudio('semi');
    if (domain === 'combo_product') openProductCreationStudio('combo');
    // The query param is only an entry hint for split domain routes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const saleStocks = useMemo(
    () => erpSnapshot.saleStockResult.stocks.filter((stock) => stock.branchId === branchId),
    [],
  );
  const invoiceStocks = useMemo(
    () => erpSnapshot.invoiceStockResult.stocks.filter((stock) => stock.branchId === branchId),
    [],
  );
  const invoiceStockById = useMemo(
    () => new Map(invoiceStocks.map((stock) => [stock.ingredientId, stock])),
    [invoiceStocks],
  );
  const invoiceMovements = erpSnapshot.invoiceStockResult.movements;
  const selectedProduct = useMemo(
    () => saleProducts.find((product) => product.id === selectedProductId) ?? saleProducts[0] ?? null,
    [saleProducts, selectedProductId],
  );
  const selectedProductMapping = useMemo(
    () => (selectedProduct ? getProductMapping(selectedProduct.id, selectedProduct.name) : null),
    [productMappings, selectedProduct],
  );
  const selectedProductMappingValidation = useMemo(
    () => validateProductMapping(selectedProductMapping),
    [selectedProductMapping],
  );

  useEffect(() => {
    setProductMappings(loadProductMappings());
    const syncMappings = () => setProductMappings(loadProductMappings());
    window.addEventListener('adisyon-product-mappings-change', syncMappings);
    window.addEventListener('storage', syncMappings);
    return () => {
      window.removeEventListener('adisyon-product-mappings-change', syncMappings);
      window.removeEventListener('storage', syncMappings);
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;
    const mapping = getProductMapping(selectedProduct.id, selectedProduct.name);
    setMappingDraft({
      pos_plu_code: mapping?.pos_plu_code ?? '',
      vat_rate: String(mapping?.vat_rate ?? selectedProduct.vatRate ?? 10),
      unit_type: mapping?.unit_type ?? (selectedProduct.salesUnit === 'kg' ? 'kg' : selectedProduct.salesUnit === 'glass' ? 'bardak' : selectedProduct.salesUnit === 'bottle' ? 'sise' : 'porsiyon'),
    });
    setMappingMessage('');
  }, [selectedProduct]);
  const filteredSaleProducts = useMemo(() => {
    const query = deferredSaleProductSearch.trim().toLocaleLowerCase('tr-TR');
    if (!query) return saleProducts;

    return saleProducts.filter((product) => {
      const searchable = `${product.name} ${product.category} ${formatSaleUnitLabel(product.salesUnit)}`.toLocaleLowerCase('tr-TR');
      return searchable.includes(query);
    });
  }, [deferredSaleProductSearch, saleProducts]);
  const quickPriceProducts = useMemo(() => {
    const query = quickPriceSearch.trim().toLocaleLowerCase('tr-TR');
    if (!query) return saleProducts;

    return saleProducts.filter((product) => {
      const searchable = `${product.name} ${product.category}`.toLocaleLowerCase('tr-TR');
      return searchable.includes(query);
    });
  }, [quickPriceSearch, saleProducts]);
  const quickPriceChangedCount = useMemo(
    () => quickPriceProducts.reduce((count, product) => {
      const currentPrice = product.salePrice1 || product.salePrice;
      return (quickPriceDrafts[product.id] ?? currentPrice).trim() !== currentPrice.trim() ? count + 1 : count;
    }, 0),
    [quickPriceDrafts, quickPriceProducts],
  );
  useEffect(() => {
    if (activeWindow === 'sale' && !selectedProductId && saleProducts[0]) {
      setSelectedProductId(saleProducts[0].id);
    }
  }, [activeWindow, selectedProductId, saleProducts]);

  useEffect(() => {
    setQuickPriceDrafts((current) => {
      const next = { ...current };
      let changed = false;

      saleProducts.forEach((product) => {
        if (next[product.id] !== undefined) return;
        next[product.id] = product.salePrice1 || product.salePrice || '0';
        changed = true;
      });

      Object.keys(next).forEach((productId) => {
        if (saleProducts.some((product) => product.id === productId)) return;
        delete next[productId];
        changed = true;
      });

      return changed ? next : current;
    });
  }, [saleProducts]);

  useEffect(() => {
    if (!saleProducts[0]) {
      setQuickDuplicateSourceId('');
      return;
    }

    setQuickDuplicateSourceId((current) =>
      current && saleProducts.some((product) => product.id === current) ? current : saleProducts[0].id,
    );
  }, [saleProducts]);

  useEffect(() => {
    const refresh = () => setIntegrationState(loadIntegrationState());

    refresh();
    const unsubscribe = subscribeToIntegrationChanges(refresh);
    return () => unsubscribe();
  }, []);

  const printerOptions = useMemo(() => {
    const names = new Set<string>();
    integrationState.printerDevices
      .filter((printer) => printer.status !== 'Pasif')
      .forEach((printer) => names.add(printer.name));
    integrationState.printerMappings.forEach((mapping) => {
      if (mapping.printer) names.add(mapping.printer);
      if (mapping.fallback) names.add(mapping.fallback);
    });
    return Array.from(names);
  }, [integrationState.printerDevices, integrationState.printerMappings]);

  const categoryPrinterRows = useMemo(
    () => categories.map((category) => ({
      category,
      mapping: findExactPrinterMapping(category, integrationState.printerMappings),
    })),
    [categories, integrationState.printerMappings],
  );

  const selectedProductPrinterMapping = useMemo(
    () => (selectedProduct ? findPrinterMappingForCategory(selectedProduct.category, integrationState.printerMappings) : null),
    [integrationState.printerMappings, selectedProduct],
  );
  const selectedProductRecipeLines = useMemo(
    () => (selectedProduct ? getProductEffectiveRecipeLines(selectedProduct, recipeVersions) : []),
    [recipeVersions, selectedProduct],
  );
  const selectedRecipe = useMemo(
    () => recipePool.find((recipe) => recipe.id === selectedProduct?.recipeId) ?? null,
    [recipePool, selectedProduct?.recipeId],
  );
  const selectedRecipeVersion = useMemo(
    () => getLatestPublishedRecipeVersion(selectedProduct?.recipeId, recipeVersions),
    [recipeVersions, selectedProduct?.recipeId],
  );
  const selectedPoolRecipe = useMemo(
    () => recipePool.find((recipe) => recipe.id === selectedPoolRecipeId) ?? recipePool[0] ?? null,
    [recipePool, selectedPoolRecipeId],
  );
  const recipeCategories = useMemo(() => {
    const uniqueCategories = new Set<string>();
    recipePool.forEach((recipe) => uniqueCategories.add(recipe.category || inferCategory(recipe.name)));
    return ['Tümü', ...Array.from(uniqueCategories).sort((left, right) => left.localeCompare(right, 'tr'))];
  }, [recipePool]);
  const filteredRecipePool = useMemo(() => {
    if (selectedRecipeCategory === 'Tümü') return recipePool;
    return recipePool.filter((recipe) => (recipe.category || inferCategory(recipe.name)) === selectedRecipeCategory);
  }, [recipePool, selectedRecipeCategory]);
  useEffect(() => {
    if (activeWindow !== 'recipe') return;
    if (selectedPoolRecipeId && filteredRecipePool.some((recipe) => recipe.id === selectedPoolRecipeId)) return;
    setSelectedPoolRecipeId(filteredRecipePool[0]?.id ?? '');
  }, [activeWindow, filteredRecipePool, selectedPoolRecipeId]);
  const selectedPoolVersion = useMemo(
    () => getLatestPublishedRecipeVersion(selectedPoolRecipe?.id, recipeVersions),
    [recipeVersions, selectedPoolRecipe?.id],
  );

  const ingredientOptions = useMemo(() => {
    return [
      ...erpIngredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name, unit: ingredient.unit })),
      ...createdRawIngredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name, unit: ingredient.unit })),
    ];
  }, [createdRawIngredients]);
  const ingredientOptionById = useMemo(
    () => new Map(ingredientOptions.map((ingredient) => [ingredient.id, ingredient])),
    [ingredientOptions],
  );

  const rawInventoryRows = useMemo(() => {
    const seededRows = saleStocks.map((stock) => {
      const ingredient = getIngredient(stock.ingredientId);
      const invoiceStock = invoiceStockById.get(stock.ingredientId);
      const override = rawCountOverrides[stock.ingredientId];
      const effectiveInvoiceQuantity = override ? parseAmount(override.currentQuantity) : (invoiceStock?.quantity ?? stock.quantity);
      return {
        id: stock.ingredientId,
        name: ingredient?.name ?? stock.ingredientId,
        unit: ingredient?.unit ?? 'adet',
        saleQuantity: stock.quantity,
        invoiceQuantity: effectiveInvoiceQuantity,
        minimumQuantity: stock.minimumQuantity,
        averageCost: invoiceStock?.averageCost ?? stock.averageCost,
        lastCountedAt: override?.lastCountedAt,
      };
    });

    const createdRows = createdRawIngredients.map((ingredient) => {
      const override = rawCountOverrides[ingredient.id];
      const effectiveQuantity = override ? parseAmount(override.currentQuantity) : (Number(ingredient.currentQuantity.replace(',', '.')) || 0);
      return {
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        purchasePrice: ingredient.purchasePrice,
        saleQuantity: effectiveQuantity,
        invoiceQuantity: effectiveQuantity,
        minimumQuantity: Number(ingredient.minimumQuantity.replace(',', '.')) || 0,
        averageCost: Number((ingredient.purchasePrice ?? '0').replace(',', '.')) || 0,
        lastCountedAt: override?.lastCountedAt,
      };
    });

    return [...seededRows, ...createdRows];
  }, [createdRawIngredients, invoiceStockById, rawCountOverrides, saleStocks]);

  const filteredRawInventoryRows = useMemo(() => {
    const query = deferredRawSearch.trim().toLocaleLowerCase('tr-TR');
    if (!query) return rawInventoryRows;

    return rawInventoryRows.filter((row) => row.name.toLocaleLowerCase('tr-TR').includes(query));
  }, [deferredRawSearch, rawInventoryRows]);

  const selectedRawRow = useMemo(
    () => filteredRawInventoryRows.find((row) => row.id === selectedRawId) ?? filteredRawInventoryRows[0] ?? null,
    [filteredRawInventoryRows, selectedRawId],
  );

  const productsWithoutRecipes = useMemo(
    () => saleProducts.filter((product) => product.stockProcurementType !== 'direct' && getProductEffectiveRecipeLines(product, recipeVersions).length === 0),
    [recipeVersions, saleProducts],
  );

  const selectedProductSuggestions = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedIngredientIds = new Set(selectedProductRecipeLines.map((line) => line.ingredientId));
    return inferRecipeSuggestions(selectedProduct.name, selectedProduct.category, ingredientOptions).filter(
      (ingredient) => !selectedIngredientIds.has(ingredient.id),
    );
  }, [ingredientOptions, selectedProduct, selectedProductRecipeLines]);

  const pricingWindowIssues = useMemo(() => {
    if (!selectedProduct) return [] as string[];

    const issues: string[] = [];
    const p1Start = selectedProduct.price1Start.trim();
    const p1End = selectedProduct.price1End.trim();
    const p2Start = selectedProduct.price2Start.trim();
    const p2End = selectedProduct.price2End.trim();

    if (p1Start && !isValidTimeHHmm(p1Start)) {
      issues.push('Fiyat 1 başlangıç saati HH:mm formatında olmalı.');
    }
    if (p1End && !isValidTimeHHmm(p1End)) {
      issues.push('Fiyat 1 bitiş saati HH:mm formatında olmalı.');
    }
    if (selectedProduct.price1WindowEnabled && (!p1Start || !p1End)) {
      issues.push('Fiyat 1 saat aralığı aktifken başlangıç ve bitiş zorunlu.');
    }

    if (p2Start && !isValidTimeHHmm(p2Start)) {
      issues.push('Fiyat 2 başlangıç saati HH:mm formatında olmalı.');
    }
    if (p2End && !isValidTimeHHmm(p2End)) {
      issues.push('Fiyat 2 bitiş saati HH:mm formatında olmalı.');
    }
    if (selectedProduct.price2WindowEnabled && (!p2Start || !p2End)) {
      issues.push('Fiyat 2 saat aralığı aktifken başlangıç ve bitiş zorunlu.');
    }

    return issues;
  }, [selectedProduct]);

  const selectedRawHistory = useMemo(() => {
    if (!selectedRawRow) return [];
    return ingredientPurchaseHistory
      .filter((item) => item.ingredientId === selectedRawRow.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedRawRow]);

  const selectedRawSummary = useMemo(() => {
    if (!selectedRawRow) return null;
    const history = selectedRawHistory;
    const latest = history[0] ?? null;
    const yearlyPurchaseQuantity = history.reduce((sum, item) => sum + item.quantity, 0);
    const prices = history.map((item) => item.unitPrice);
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const priceVariance = highestPrice - lowestPrice;

    return {
      latest,
      yearlyPurchaseQuantity,
      highestPrice,
      lowestPrice,
      priceVariance,
    };
  }, [selectedRawHistory, selectedRawRow]);

  const selectedRawSupplierSummary = useMemo(() => {
    if (!selectedRawRow) return [];

    const grouped = new Map<
      string,
      {
        supplierName: string;
        totalQuantity: number;
        latestInvoiceNo: string;
        latestDate: string;
        latestUnitPrice: number;
      }
    >();

    selectedRawHistory.forEach((item) => {
      const current = grouped.get(item.supplierName);
      if (!current) {
        grouped.set(item.supplierName, {
          supplierName: item.supplierName,
          totalQuantity: item.quantity,
          latestInvoiceNo: item.invoiceNo,
          latestDate: item.date,
          latestUnitPrice: item.unitPrice,
        });
        return;
      }

      current.totalQuantity += item.quantity;
      if (item.date > current.latestDate) {
        current.latestDate = item.date;
        current.latestInvoiceNo = item.invoiceNo;
        current.latestUnitPrice = item.unitPrice;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [selectedRawHistory, selectedRawRow]);

  const selectedRawStockTimeline = useMemo(() => {
    if (!selectedRawRow) return [];

    const movementFromInvoice = invoiceMovements
      .filter((movement) => movement.ingredientId === selectedRawRow.id)
      .map((movement) => ({
        label: selectedRawSummary?.latest?.invoiceNo ?? 'Alış faturası',
        date: selectedRawSummary?.latest?.date ?? new Date().toISOString().slice(0, 10),
        type: 'Alış faturası',
        quantity: movement.quantity,
        direction: 'in' as const,
      }));

    const saleDelta = selectedRawRow.invoiceQuantity - selectedRawRow.saleQuantity;
    const movementFromSales =
      saleDelta > 0
        ? [
            {
              label: 'POS satışları',
              date: '2026-04-18',
              type: 'Reçete tüketimi',
              quantity: saleDelta,
              direction: 'out' as const,
            },
          ]
        : [];

    return [...movementFromInvoice, ...movementFromSales].sort((a, b) => b.date.localeCompare(a.date));
  }, [invoiceMovements, selectedRawRow, selectedRawSummary]);

  const selectedRawUsageSummary = useMemo(() => {
    if (!selectedRawRow) return null;

    const usage = ingredientUsageMetrics[selectedRawRow.id] ?? { last30DaysUsage: 0, avgDailyUsage: 0 };
    const daysCover = usage.avgDailyUsage > 0 ? selectedRawRow.invoiceQuantity / usage.avgDailyUsage : 0;

    let warningLabel = 'Stok rahat';
    let warningTone = 'text-emerald-200 bg-emerald-500/10 border-emerald-400/20';

    if (selectedRawRow.invoiceQuantity <= selectedRawRow.minimumQuantity) {
      warningLabel = 'Kritik stok';
      warningTone = 'text-rose-200 bg-rose-500/10 border-rose-400/20';
    } else if (daysCover > 0 && daysCover <= 10) {
      warningLabel = '10 günden az yeter';
      warningTone = 'text-amber-200 bg-amber-500/10 border-amber-400/20';
    } else if (daysCover > 0 && daysCover <= 20) {
      warningLabel = 'Yakın takip';
      warningTone = 'text-sky-100 bg-sky-500/10 border-sky-400/20';
    }

    return {
      ...usage,
      daysCover,
      warningLabel,
      warningTone,
    };
  }, [selectedRawRow]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? warehouses[0] ?? MAIN_WAREHOUSE,
    [selectedWarehouseId, warehouses],
  );

  const selectedWarehouseStock = useMemo(
    () => getWarehouseStock(warehouseStocks, selectedWarehouse.id),
    [selectedWarehouse.id, warehouseStocks],
  );

  const transferSourceStock = useMemo(
    () => getWarehouseStock(warehouseStocks, transferFromWarehouseId),
    [transferFromWarehouseId, warehouseStocks],
  );

  const mainWarehouseStock = useMemo(
    () => getWarehouseStock(warehouseStocks, MAIN_WAREHOUSE_ID),
    [warehouseStocks],
  );

  const warehouseHistory = useMemo(
    () => warehouseTransfers.filter((record) => record.fromWarehouseId === selectedWarehouse.id || record.toWarehouseId === selectedWarehouse.id),
    [selectedWarehouse.id, warehouseTransfers],
  );

  const transferIngredientLine = useMemo(
    () => transferSourceStock.find((line) => line.ingredientId === transferIngredientId) ?? null,
    [transferSourceStock, transferIngredientId],
  );

  const transferTargetWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.id !== transferFromWarehouseId),
    [transferFromWarehouseId, warehouses],
  );

  const transferSearchResults = useMemo(() => {
    const query = transferIngredientSearch.trim().toLocaleLowerCase('tr-TR');
    if (query.length < 3) return [] as WarehouseStockLineModel[];
    return transferSourceStock
      .filter((line) => line.ingredientName.toLocaleLowerCase('tr-TR').includes(query))
      .slice(0, 8);
  }, [transferIngredientSearch, transferSourceStock]);

  const adisyonUsageByWarehouseItem = useMemo(() => {
    const usage = new Map<string, number>();

    saleProducts.forEach((product) => {
      const soldCount = Math.max(0, product.salesCount || 0);
      if (soldCount === 0) return;

      if (product.stockProcurementType === 'direct') {
        const bottleMl = clToMl(parseAmount(product.bottleVolumeCl || '70'));
        const portionMl = clToMl(parseAmount(product.portionVolumeCl || '5'));
        const consumption = product.barStockMode === 'bottle-glass'
          ? (bottleMl > 0 ? (soldCount * portionMl) / bottleMl : 0)
          : soldCount;
        const key = getSaleWarehouseItemId(product.id);
        usage.set(key, (usage.get(key) ?? 0) + consumption);
        return;
      }

      const portionMultiplier = Math.max(0, parseAmount(product.portionMultiplier || '1')) || 1;
      const lines = getProductEffectiveRecipeLines(product, recipeVersions);

      lines.forEach((line) => {
        const ingredient = ingredientOptionById.get(line.ingredientId);
        const qty = Math.max(0, parseAmount(line.quantity));
        const baseQty = convertToIngredientBaseUnit(qty, line.unit, ingredient?.unit ?? line.unit);
        const consumed = baseQty * soldCount * portionMultiplier;
        usage.set(line.ingredientId, (usage.get(line.ingredientId) ?? 0) + consumed);
      });
    });

    return usage;
  }, [ingredientOptionById, recipeVersions, saleProducts]);

  const transferIsReturnToMain = transferToWarehouseId === MAIN_WAREHOUSE_ID && transferFromWarehouseId !== MAIN_WAREHOUSE_ID;
  const estimatedConsumedForTransferLine = useMemo(
    () => (transferIngredientId ? adisyonUsageByWarehouseItem.get(transferIngredientId) ?? 0 : 0),
    [adisyonUsageByWarehouseItem, transferIngredientId],
  );
  const suggestedReturnQty = useMemo(() => {
    if (!transferIngredientLine) return 0;
    if (!transferIsReturnToMain) return transferIngredientLine.quantity;
    return Math.max(0, transferIngredientLine.quantity - estimatedConsumedForTransferLine);
  }, [estimatedConsumedForTransferLine, transferIngredientLine, transferIsReturnToMain]);

  const rawCountDifference = useMemo(() => {
    if (!selectedRawRow) return 0;
    return parseAmount(rawCountInput) - selectedRawRow.invoiceQuantity;
  }, [rawCountInput, selectedRawRow]);

  const selectedProductFinance = useMemo(() => {
    if (!selectedProduct) {
      return {
        ingredientCost: 0,
        wasteCost: 0,
        operationalCost: 0,
        totalCost: 0,
        salePrice: 0,
        profit: 0,
        profitMargin: 0,
      };
    }

    const portionMultiplier = Math.max(0, parseAmount(selectedProduct.portionMultiplier || '1')) || 1;
    const ingredientCost = selectedProductRecipeLines.reduce((sum, line) => {
      const ingredient = ingredientOptionById.get(line.ingredientId);
      const stock = invoiceStockById.get(line.ingredientId);
      const qty = parseAmount(line.quantity);
      const baseQty = convertToIngredientBaseUnit(qty, line.unit, ingredient?.unit ?? line.unit);
      return sum + (stock?.averageCost ?? 0) * baseQty * portionMultiplier;
    }, 0);

    const wastePercentage = Math.max(0, parseAmount(selectedProduct.wastePercentage));
    const wasteCost = ingredientCost * (wastePercentage / 100);
    const operationalCost = Math.max(0, parseAmount(selectedProduct.operationalCost));
    const totalCost = ingredientCost + wasteCost + operationalCost;
    const salePrice = Math.max(0, parseAmount(selectedProduct.salePrice1 || selectedProduct.salePrice));
    const profit = salePrice - totalCost;
    const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    return {
      ingredientCost,
      wasteCost,
      operationalCost,
      totalCost,
      salePrice,
      profit,
      profitMargin,
    };
  }, [ingredientOptionById, invoiceStockById, selectedProduct, selectedProductRecipeLines]);

  const saleCountDifference = useMemo(() => {
    if (!selectedProduct) return 0;
    return parseAmount(saleCountInput) - parseAmount(selectedProduct.currentStock);
  }, [saleCountInput, selectedProduct]);

  const selectedProductAlcoholControl = useMemo(() => {
    if (!selectedProduct) return null;
    if (selectedProduct.stockProcurementType !== 'direct' || selectedProduct.barStockMode !== 'bottle-glass') return null;

    const bottleVolumeCl = Math.max(0, parseAmount(selectedProduct.bottleVolumeCl || '70'));
    const portionVolumeCl = Math.max(0, parseAmount(selectedProduct.portionVolumeCl || '5'));
    const initialBottleCount = Math.max(0, parseAmount(selectedProduct.initialBottleCount || selectedProduct.currentStock || '0'));
    const sealedBottleCount = Math.max(0, Math.floor(parseAmount(selectedProduct.currentStock || '0')));
    const dispensedPortions = Math.max(0, parseAmount(selectedProduct.dispensedPortions || '0'));

    const actualState = buildInitialAlcoholState({
      bottleVolumeCl,
      portionVolumeCl,
      sealedBottleCount,
      openBottles: selectedProduct.openBottleSnapshots,
      dispensedPortions,
    });

    const actualRemainingMl = getActualRemainingMl(actualState);
    const variance = analyzeAlcoholVariance({
      bottleVolumeCl,
      portionVolumeCl,
      expectedPortionsSold: Math.max(0, selectedProduct.salesCount),
      actualRemainingMl,
      initialBottleCount,
    });

    return {
      bottleVolumeCl,
      portionVolumeCl,
      portionsPerBottle: getPortionsPerBottle(bottleVolumeCl, portionVolumeCl),
      initialBottleCount,
      sealedBottleCount,
      openBottleCount: selectedProduct.openBottleSnapshots.length,
      actualRemainingMl,
      variance,
    };
  }, [selectedProduct]);

  const barAlcoholSaleProducts = useMemo(
    () => saleProducts.filter((product) => isBarLinkedProduct(product)),
    [saleProducts],
  );

  const barActionSearchResults = useMemo(() => {
    const query = deferredBarActionProductQuery.trim().toLocaleLowerCase('tr-TR');
    const source = [...barAlcoholSaleProducts].sort((left, right) => left.name.localeCompare(right.name, 'tr'));
    if (!query) return source.slice(0, 8);
    return source.filter((product) => product.name.toLocaleLowerCase('tr-TR').includes(query)).slice(0, 8);
  }, [barAlcoholSaleProducts, deferredBarActionProductQuery]);

  const selectedBarActionProduct = useMemo(
    () => barAlcoholSaleProducts.find((product) => product.id === barActionProductId) ?? null,
    [barActionProductId, barAlcoholSaleProducts],
  );

  const barDashboardItems = useMemo<BarDashboardItem[]>(() => {
    return saleProducts
      .filter((product) => isBarLinkedProduct(product))
      .map((product) => {
        const bottleVolumeCl = Math.max(0, parseAmount(product.bottleVolumeCl || '70'));
        const portionVolumeCl = Math.max(0, parseAmount(product.portionVolumeCl || '5'));
        const bottleMl = clToMl(bottleVolumeCl);
        const sealedBottleCount = Math.max(0, Math.floor(parseAmount(product.currentStock || '0')));
        const dispensedPortions = Math.max(0, parseAmount(product.dispensedPortions || '0'));

        const actualState = buildInitialAlcoholState({
          bottleVolumeCl,
          portionVolumeCl,
          sealedBottleCount,
          openBottles: product.openBottleSnapshots,
          dispensedPortions,
        });

        const actualRemainingMl = getActualRemainingMl(actualState);
        const variance = analyzeAlcoholVariance({
          bottleVolumeCl,
          portionVolumeCl,
          expectedPortionsSold: Math.max(0, product.salesCount),
          actualRemainingMl,
          initialBottleCount: Math.max(0, parseAmount(product.initialBottleCount || product.currentStock || '0')),
        });

        const item: Omit<BarDashboardItem, 'alerts'> = {
          product,
          bottleMl,
          sealedBottleCount,
          openBottleCount: product.openBottleSnapshots.length,
          actualRemainingMl,
          remainingPortions: portionVolumeCl > 0 ? actualRemainingMl / clToMl(portionVolumeCl) : 0,
          salesGlasses: Math.max(0, product.salesCount),
          pendingPortions: Math.max(0, Math.max(0, product.salesCount) - dispensedPortions),
          totalConsumptionCl: Math.max(0, product.salesCount) * portionVolumeCl,
          variance,
          stockLevel: bottleMl > 0 ? actualRemainingMl / bottleMl : 0,
        };

        return {
          ...item,
          alerts: buildBarDashboardAlerts(item),
        };
      })
      .sort((left, right) => {
        const severity: Record<BarAlertLevel, number> = { critical: 0, warning: 1, ok: 2 };
        return severity[left.alerts[0].level] - severity[right.alerts[0].level] || left.product.name.localeCompare(right.product.name, 'tr');
      });
  }, [saleProducts]);

  const selectedBarProduct = useMemo(
    () => barDashboardItems.find((item) => item.product.id === selectedBarProductId) ?? barDashboardItems[0] ?? null,
    [barDashboardItems, selectedBarProductId],
  );

  const barOpenBottles = useMemo<BarOpenBottleRow[]>(() => {
    return barDashboardItems
      .flatMap((item) => item.product.openBottleSnapshots.map((bottle) => ({
        productId: item.product.id,
        productName: item.product.name,
        category: item.product.category,
        bottleId: bottle.id,
        openedAt: bottle.openedAt,
        bottleMl: item.bottleMl,
        portionMl: clToMl(parseAmount(item.product.portionVolumeCl || '5')),
        remainingMl: bottle.remainingMl,
        consumedMl: Math.max(0, item.bottleMl - bottle.remainingMl),
        remainingGlasses: clToMl(parseAmount(item.product.portionVolumeCl || '5')) > 0 ? bottle.remainingMl / clToMl(parseAmount(item.product.portionVolumeCl || '5')) : 0,
        consumedGlasses: clToMl(parseAmount(item.product.portionVolumeCl || '5')) > 0 ? Math.max(0, item.bottleMl - bottle.remainingMl) / clToMl(parseAmount(item.product.portionVolumeCl || '5')) : 0,
      })))
      .sort((left, right) => left.openedAt.localeCompare(right.openedAt));
  }, [barDashboardItems]);

  const barAlerts = useMemo(
    () => barDashboardItems.flatMap((item) => item.alerts.filter((alert) => alert.level !== 'ok')),
    [barDashboardItems],
  );

  const barTotals = useMemo(() => {
    const totalSales = barDashboardItems.reduce((sum, item) => sum + item.salesGlasses, 0);
    const totalConsumptionCl = barDashboardItems.reduce((sum, item) => sum + item.totalConsumptionCl, 0);
    const totalVarianceCl = barDashboardItems.reduce((sum, item) => sum + (item.variance.varianceMl / 10), 0);

    return {
      totalSales,
      totalConsumptionCl,
      totalVarianceCl,
    };
  }, [barDashboardItems]);

  const complimentarySummaryByProduct = useMemo(
    () => buildComplimentarySummaryMapFromOrders(runtimeOrdersByTable),
    [runtimeOrdersByTable],
  );

  const selectedProductComplimentarySummary = useMemo(
    () => (selectedProduct ? complimentarySummaryByProduct.get(selectedProduct.name) ?? null : null),
    [complimentarySummaryByProduct, selectedProduct],
  );

  const recipeIngredientSearchResults = useMemo(() => {
    const query = deferredRecipeIngredientQuery.trim().toLocaleLowerCase('tr-TR');
    if (query.length < 3) return [];

    return ingredientOptions
      .filter((ingredient) => ingredient.name.toLocaleLowerCase('tr-TR').includes(query))
      .slice(0, 8);
  }, [deferredRecipeIngredientQuery, ingredientOptions]);

  const selectedRecipeIngredientOption = useMemo(
    () => ingredientOptions.find((ingredient) => ingredient.id === newRecipeIngredientId) ?? null,
    [ingredientOptions, newRecipeIngredientId],
  );

  const showRecipeIngredientSearchResults = useMemo(() => {
    const query = deferredRecipeIngredientQuery.trim().toLocaleLowerCase('tr-TR');
    if (query.length < 3) return false;
    if (!selectedRecipeIngredientOption) return recipeIngredientSearchResults.length > 0;

    return selectedRecipeIngredientOption.name.toLocaleLowerCase('tr-TR') !== query && recipeIngredientSearchResults.length > 0;
  }, [deferredRecipeIngredientQuery, recipeIngredientSearchResults.length, selectedRecipeIngredientOption]);

  const quickCreateText = deferredQuickCreateText;
  const quickCreateFileName = quickCreateEnabled ? bulkFileNames[importWindow] : '';
  const quickCreateRows = useMemo(
    () => (quickCreateEnabled ? stripBulkHeader(parseBulkPaste(quickCreateText), importWindow) : []),
    [importWindow, quickCreateEnabled, quickCreateText],
  );
  const quickCreatePreview = useMemo(() => {
    if (importWindow === 'raw') {
      return quickCreateRows.slice(0, 5).map((cells) => {
        const normalized = normalizeRawUnit(cells[1] ?? 'adet');
        return {
          name: cells[0] ?? '',
          meta: `${normalized.unit} • alış ${cells[2] || '0'} ₺ • min ${cells[3] || '0'} • stok ${cells[4] || '0'}`,
        };
      });
    }

    return quickCreateRows.slice(0, 5).map((cells) => ({
      name: cells[0] ?? '',
      meta: `${cells[1] || inferCategory(cells[0] ?? '')} • ${cells[2] || '0'} ₺`,
    }));
  }, [importWindow, quickCreateRows]);

  const quickCreateAnalysis = useMemo(() => {
    const issues: ImportIssue[] = [];
    let validCount = 0;

    quickCreateRows.forEach((cells, index) => {
      const rowNumber = index + 2;
      const name = (cells[0] ?? '').trim();

      if (!name) {
        issues.push({ rowNumber, message: 'Kart adı boş', cells });
        return;
      }

      if (importWindow === 'raw') {
        const unitText = (cells[1] ?? '').trim();
        const purchasePriceText = (cells[2] ?? '').trim();
        const minimumText = (cells[3] ?? '').trim();
        const stockText = (cells[4] ?? '').trim();

        if (!unitText) {
          issues.push({ rowNumber, message: 'Birim eksik', cells });
          return;
        }

        if (purchasePriceText && Number.isNaN(Number(purchasePriceText.replace(',', '.')))) {
          issues.push({ rowNumber, message: 'Alış fiyatı sayısal değil', cells });
          return;
        }

        if (minimumText && Number.isNaN(Number(minimumText.replace(',', '.')))) {
          issues.push({ rowNumber, message: 'Minimum stok sayısal değil', cells });
          return;
        }

        if (stockText && Number.isNaN(Number(stockText.replace(',', '.')))) {
          issues.push({ rowNumber, message: 'Mevcut stok sayısal değil', cells });
          return;
        }
      } else {
        const priceText = (cells[2] ?? '').trim();
        if (priceText && Number.isNaN(Number(priceText.replace(',', '.')))) {
          issues.push({ rowNumber, message: 'Satış fiyatı sayısal değil', cells });
          return;
        }
      }

      validCount += 1;
    });

    return {
      validCount,
      invalidCount: issues.length,
      issues,
    };
  }, [importWindow, quickCreateRows]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredSaleProducts(saleProducts as StoredSaleProduct[]);
  }, [hydrated, saleProducts]);

  useEffect(() => {
    const storedProducts = loadStoredSaleProducts();
    const hydratedProducts = buildInitialSaleProducts(storedProducts).map((product, index) => ({
      ...product,
      recipeId: product.recipeId ?? (product.recipeLines.length > 0 ? `recipe-${product.id}-${index + 1}` : undefined),
    }));
    const storedPool = loadStoredRecipePool();
    const hydratedRecipePool = createInitialRecipePoolState(hydratedProducts, storedPool);
    const hydratedRawIngredients = loadStoredRawIngredients().map((ingredient) => ({
      ...ingredient,
      vatRate: ingredient.vatRate ?? 20,
    }));

    setSaleProducts(hydratedProducts);
    setRecipePool(hydratedRecipePool.recipes);
    setRecipeVersions(hydratedRecipePool.versions);
    setCreatedRawIngredients(hydratedRawIngredients);
    setRawCountOverrides(loadRawStockCountOverrides());
    setSelectedProductId((current) =>
      hydratedProducts.some((product) => product.id === current) ? current : hydratedProducts[0]?.id ?? '',
    );
    setSelectedRawId((current) =>
      [...erpIngredients.map((ingredient) => ingredient.id), ...hydratedRawIngredients.map((ingredient) => ingredient.id)].includes(current)
        ? current
        : erpIngredients[0]?.id ?? hydratedRawIngredients[0]?.id ?? '',
    );
    setSelectedPoolRecipeId((current) =>
      hydratedRecipePool.recipes.some((recipe) => recipe.id === current) ? current : hydratedRecipePool.recipes[0]?.id ?? '',
    );

    const today = new Date().toISOString().slice(0, 10);
    const purchaseInvoices = loadStoredPurchaseInvoices();
    setDailyPurchaseInvoiceTotal(getDailyPurchaseInvoiceTotal(today, purchaseInvoices));
    setDailyPurchaseInvoiceCount(getDailyPurchaseInvoiceCount(today, purchaseInvoices));

    const storedWarehouses = loadWarehouses();
    const storedWarehouseStocks = loadAllWarehouseStocks();
    const storedWarehouseTransfers = loadTransferRecords();

    if (!storedWarehouseStocks[MAIN_WAREHOUSE_ID] || storedWarehouseStocks[MAIN_WAREHOUSE_ID].length === 0) {
      const seededMap = new Map<string, WarehouseStockLineModel>();

      saleStocks.forEach((stock) => {
        const ingredient = getIngredient(stock.ingredientId);
        const invoiceQuantity = invoiceStockById.get(stock.ingredientId)?.quantity ?? stock.quantity;
        seededMap.set(stock.ingredientId, {
          ingredientId: stock.ingredientId,
          ingredientName: ingredient?.name ?? stock.ingredientId,
          unit: normalizeWarehouseUnit(ingredient?.unit ?? 'adet'),
          quantity: invoiceQuantity,
        });
      });

      hydratedRawIngredients.forEach((ingredient) => {
        seededMap.set(ingredient.id, {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          unit: normalizeWarehouseUnit(ingredient.unit),
          quantity: Math.max(0, parseAmount(ingredient.currentQuantity)),
        });
      });

      hydratedProducts
        .filter((product) => product.stockProcurementType === 'direct')
        .forEach((product) => {
          const stockQty = getDirectProductWarehouseQuantity(product);
          seededMap.set(getSaleWarehouseItemId(product.id), {
            ingredientId: getSaleWarehouseItemId(product.id),
            ingredientName: `${product.name} (Satış ürünü)`,
            unit: getSaleProductWarehouseUnit(product),
            quantity: stockQty,
          });
        });

      storedWarehouseStocks[MAIN_WAREHOUSE_ID] = Array.from(seededMap.values());
    }

    setWarehouses(storedWarehouses);
    setWarehouseStocks(storedWarehouseStocks);
    setWarehouseTransfers(storedWarehouseTransfers);
    setSelectedWarehouseId((current) =>
      storedWarehouses.some((warehouse) => warehouse.id === current) ? current : MAIN_WAREHOUSE_ID,
    );
    setTransferFromWarehouseId((current) =>
      storedWarehouses.some((warehouse) => warehouse.id === current) ? current : MAIN_WAREHOUSE_ID,
    );
    setTransferToWarehouseId((current) => {
      if (current && storedWarehouses.some((warehouse) => warehouse.id === current)) return current;
      return storedWarehouses.find((warehouse) => warehouse.id !== MAIN_WAREHOUSE_ID)?.id ?? '';
    });

    const storedOrdersByTable = getStoredOrdersByTable<RuntimeOrderLine>();
    setRuntimeOrdersByTable(storedOrdersByTable);
    const actualSales = buildSalesCountMapFromOrders(storedOrdersByTable);
    if (actualSales.size > 0) {
      setSaleProducts((current) => current.map((product) => ({
        ...product,
        salesCount: actualSales.get(product.name) ?? 0,
      })));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    setPoolDraftLines(
      selectedPoolVersion?.ingredients.map((line) => ({ ...line })) ?? [],
    );
  }, [selectedPoolVersion?.id]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredRawIngredients(createdRawIngredients);
  }, [hydrated, createdRawIngredients]);

  useEffect(() => {
    if (!hydrated) return;
    saveRawStockCountOverrides(rawCountOverrides);
  }, [hydrated, rawCountOverrides]);

  useEffect(() => {
    if (!hydrated) return;
    saveWarehouses(warehouses);
  }, [hydrated, warehouses]);

  useEffect(() => {
    if (!hydrated) return;
    saveAllWarehouseStocks(warehouseStocks);
  }, [hydrated, warehouseStocks]);

  useEffect(() => {
    if (!hydrated) return;

    setWarehouseStocks((current) => {
      const mainItems = [...(current[MAIN_WAREHOUSE_ID] ?? [])];
      let changed = false;

      saleProducts
        .filter((product) => product.stockProcurementType === 'direct')
        .forEach((product) => {
          const itemId = getSaleWarehouseItemId(product.id);
          const existingLineIndex = mainItems.findIndex((line) => line.ingredientId === itemId);

          if (existingLineIndex >= 0) {
            const existingLine = mainItems[existingLineIndex];
            const nextName = `${product.name} (Satış ürünü)`;
            const nextUnit = getSaleProductWarehouseUnit(product);
            const nextQuantity = getDirectProductWarehouseQuantity(product);
            if (existingLine.ingredientName !== nextName || existingLine.unit !== nextUnit || Math.abs(existingLine.quantity - nextQuantity) > 0.0001) {
              mainItems[existingLineIndex] = {
                ...existingLine,
                ingredientName: nextName,
                unit: nextUnit,
                quantity: nextQuantity,
              };
              changed = true;
            }
            return;
          }

          mainItems.push({
            ingredientId: itemId,
            ingredientName: `${product.name} (Satış ürünü)`,
            unit: getSaleProductWarehouseUnit(product),
            quantity: getDirectProductWarehouseQuantity(product),
          });
          changed = true;
        });

      if (!changed) return current;
      return {
        ...current,
        [MAIN_WAREHOUSE_ID]: mainItems,
      };
    });
  }, [hydrated, saleProducts]);

  useEffect(() => {
    if (!hydrated) return;
    saveTransferRecords(warehouseTransfers);
  }, [hydrated, warehouseTransfers]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredRecipePool(recipePool, recipeVersions);
  }, [hydrated, recipePool, recipeVersions]);

  useEffect(() => {
    if (!selectedRawRow) return;
    setRawCountInput(String(selectedRawRow.invoiceQuantity).replace('.', ','));
  }, [selectedRawRow?.id, selectedRawRow?.invoiceQuantity]);

  useEffect(() => {
    if (!selectedProduct) return;
    setSaleCountInput(selectedProduct.currentStock);
  }, [selectedProduct?.currentStock, selectedProduct?.id]);

  useEffect(() => {
    if (activeWindow !== 'bar') return;

    if (!selectedBarProductId && barDashboardItems[0]) {
      setSelectedBarProductId(barDashboardItems[0].product.id);
      return;
    }

    if (selectedBarProductId && !barDashboardItems.some((item) => item.product.id === selectedBarProductId)) {
      setSelectedBarProductId(barDashboardItems[0]?.product.id ?? '');
    }
  }, [activeWindow, barDashboardItems, selectedBarProductId]);

  useEffect(() => {
    if (activeWindow !== 'bar') return;

    if (!barActionProductId && barAlcoholSaleProducts[0]) {
      setBarActionProductId(barAlcoholSaleProducts[0].id);
      setBarActionProductQuery(barAlcoholSaleProducts[0].name);
      return;
    }

    if (barActionProductId && !barAlcoholSaleProducts.some((product) => product.id === barActionProductId)) {
      setBarActionProductId(barAlcoholSaleProducts[0]?.id ?? '');
      setBarActionProductQuery(barAlcoholSaleProducts[0]?.name ?? '');
    }
  }, [activeWindow, barActionProductId, barAlcoholSaleProducts]);

  useEffect(() => {
    if (!selectedBarProduct) {
      setSelectedBarBottleId('');
      setBarOpenBottleCount('1');
      setBarManualSealedCount('0');
      setBarManualBottleRemainingCl('0');
      setBarStockCheckInput('0');
      return;
    }

    setBarManualSealedCount(String(selectedBarProduct.sealedBottleCount));
    setBarStockCheckInput(selectedBarProduct.bottleMl > 0 ? String(selectedBarProduct.actualRemainingMl / selectedBarProduct.bottleMl) : '0');
    const firstBottle = selectedBarProduct.product.openBottleSnapshots[0]?.id ?? '';

    setSelectedBarBottleId((current) => {
      if (current && selectedBarProduct.product.openBottleSnapshots.some((item) => item.id === current)) {
        return current;
      }
      return firstBottle;
    });
  }, [selectedBarProduct]);

  useEffect(() => {
    if (!selectedBarProduct) {
      setBarManualBottleRemainingCl('0');
      return;
    }

    const selectedBottle = selectedBarProduct.product.openBottleSnapshots.find((item) => item.id === selectedBarBottleId);
    setBarManualBottleRemainingCl(selectedBottle ? String(selectedBottle.remainingMl / 10) : '0');
  }, [selectedBarBottleId, selectedBarProduct]);

  useEffect(() => {
    if (!hydrated) return;

    const syncSalesCounts = () => {
      const storedOrdersByTable = getStoredOrdersByTable<RuntimeOrderLine>();
      setRuntimeOrdersByTable(storedOrdersByTable);
      const actualSales = buildSalesCountMapFromOrders(storedOrdersByTable);

      setSaleProducts((current) => {
        const next = current.map((product) => {
          const nextSalesCount = actualSales.get(product.name) ?? 0;

          if (product.stockProcurementType !== 'direct' || product.barStockMode !== 'bottle-glass') {
            return product.salesCount === nextSalesCount ? product : { ...product, salesCount: nextSalesCount };
          }

          const bottleVolumeCl = Math.max(0, parseAmount(product.bottleVolumeCl || '70'));
          const portionVolumeCl = Math.max(0, parseAmount(product.portionVolumeCl || '5'));
          if (bottleVolumeCl <= 0 || portionVolumeCl <= 0) {
            return product.salesCount === nextSalesCount ? product : { ...product, salesCount: nextSalesCount };
          }

          const alreadyDispensed = Math.max(0, parseAmount(product.dispensedPortions || '0'));
          const deltaPortions = nextSalesCount - alreadyDispensed;

          if (deltaPortions <= 0.0001) {
            return product.salesCount === nextSalesCount ? product : { ...product, salesCount: nextSalesCount };
          }

          const state = buildInitialAlcoholState({
            bottleVolumeCl,
            portionVolumeCl,
            sealedBottleCount: Math.max(0, Math.floor(parseAmount(product.currentStock || '0'))),
            openBottles: product.openBottleSnapshots,
            dispensedPortions: alreadyDispensed,
          });

          const consumed = consumeOpenBottlePortionsOnly(state, deltaPortions);

          return {
            ...product,
            salesCount: nextSalesCount,
            currentStock: String(consumed.state.sealedBottleCount),
            dispensedPortions: String(consumed.state.dispensedPortions),
            openBottleSnapshots: consumed.state.openBottles,
            initialBottleCount: product.initialBottleCount || String(Math.max(0, parseAmount(product.currentStock || '0'))),
          };
        });

        return next.some((product, index) => product !== current[index]) ? next : current;
      });
    };

    syncSalesCounts();
    return subscribeToStoredOrdersChanges(syncSalesCounts);
  }, [hydrated]);

  useEffect(() => {
    if (warehouses.some((warehouse) => warehouse.id === selectedWarehouseId)) return;
    setSelectedWarehouseId(MAIN_WAREHOUSE_ID);
  }, [selectedWarehouseId, warehouses]);

  useEffect(() => {
    if (transferToWarehouseId && transferToWarehouseId !== transferFromWarehouseId) return;
    const fallback = warehouses.find((warehouse) => warehouse.id !== transferFromWarehouseId)?.id ?? '';
    setTransferToWarehouseId(fallback);
  }, [transferFromWarehouseId, transferToWarehouseId, warehouses]);

  useEffect(() => {
    if (!transferIsReturnToMain) return;
    setTransferCountInput(String(suggestedReturnQty).replace('.', ','));
  }, [suggestedReturnQty, transferIsReturnToMain, transferIngredientId]);

  function updateNewItemDraft<K extends keyof NewItemDraft>(field: K, value: NewItemDraft[K]) {
    setNewItemDraft((current) => {
      const next = { ...current, [field]: value };
      const nextProductType = field === 'itemType'
        ? productTypeForCreateItemType(value as CreateItemType)
        : productTypeForCreateItemType(next.itemType);
      if (field === 'itemType' || field === 'category') {
        next.category = coerceCategoryForProductType(next.category, nextProductType, categories);
      }
      return next;
    });
  }

  function openProductCreationStudio(type: CreateItemType) {
    const option = productCreationOptions.find((item) => item.id === type);
    resetNewItemDraft(type);
    setActiveWindow(option?.targetWindow ?? 'quick');
    setShowQuickCreate(false);
    setShowNewItemForm(true);
  }

  function updateSelectedProduct(patch: Partial<SaleProductCard>) {
    if (!selectedProduct) return;
    setSaleProducts((current) => current.map((product) => {
      if (product.id !== selectedProduct.id) return product;
      const next = { ...product, ...patch };
      next.category = coerceCategoryForProductType(next.category, next.productType, categories);
      return next;
    }));
  }

  function refreshProductMappings() {
    setProductMappings(loadProductMappings());
  }

  function saveSelectedProductMapping(verified = true) {
    if (!selectedProduct) return;

    const saved = upsertProductMapping({
      tenant_id: 'default',
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      pos_plu_code: mappingDraft.pos_plu_code,
      vat_rate: Number(mappingDraft.vat_rate),
      unit_type: mappingDraft.unit_type,
      verified,
    });

    refreshProductMappings();
    setMappingDraft({
      pos_plu_code: saved.pos_plu_code,
      vat_rate: String(saved.vat_rate),
      unit_type: saved.unit_type,
    });
    setMappingMessage(saved.status === 'valid' ? 'POS eşleştirme kaydedildi.' : 'Eşleştirme eksik alan içeriyor.');
  }

  function applyAutoProductMapping() {
    if (!selectedProduct) return;
    const autoMapping = createAutoProductMapping({
      id: selectedProduct.id,
      name: selectedProduct.name,
      vatRate: selectedProduct.vatRate,
      salesUnit: selectedProduct.salesUnit,
      category: selectedProduct.category,
    });
    setMappingDraft({
      pos_plu_code: autoMapping.pos_plu_code,
      vat_rate: String(autoMapping.vat_rate),
      unit_type: autoMapping.unit_type,
    });
    setMappingMessage('Otomatik PLU önerisi hazırlandı. Kontrol edip kaydedin.');
  }

  function applyBulkMappings() {
    const rows = bulkMappingDraft
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => {
        const [nameOrId, plu, vat = '10', unit = 'porsiyon'] = row.split(/[;,]/).map((part) => part.trim());
        const matchedProduct = saleProducts.find((product) =>
          product.id === nameOrId ||
          product.name.toLocaleLowerCase('tr-TR') === nameOrId.toLocaleLowerCase('tr-TR')
        );

        return {
          tenant_id: 'default',
          product_id: matchedProduct?.id ?? nameOrId,
          product_name: matchedProduct?.name ?? nameOrId,
          pos_plu_code: plu,
          vat_rate: Number(vat),
          unit_type: unit as PosUnitType,
          verified: true,
        };
      });

    const saved = bulkUpsertProductMappings(rows);
    refreshProductMappings();
    setMappingMessage(`${saved.length} ürün için POS eşleştirme işlendi.`);
    setBulkMappingDraft('');
  }

  function updateCategoryPrinterMapping(category: string, patch: Partial<PrinterMappingRecord>) {
    const currentState = loadIntegrationState();
    const existing = findExactPrinterMapping(category, currentState.printerMappings);
    const nextMapping: PrinterMappingRecord = {
      id: existing?.id ?? `map-${normalizePrinterCategoryKey(category) || Date.now()}`,
      category,
      printer: patch.printer ?? existing?.printer ?? '',
      fallback: patch.fallback ?? existing?.fallback ?? '',
      load: patch.load ?? existing?.load ?? 'Kategori bazlı POS yönlendirme',
    };
    const nextMappings = existing
      ? currentState.printerMappings.map((mapping) => (mapping.id === existing.id ? nextMapping : mapping))
      : [...currentState.printerMappings, nextMapping];
    const nextState = {
      ...currentState,
      printerMappings: nextMappings,
    };

    setIntegrationState(nextState);
    saveIntegrationState(nextState);
    setSavedNotes((current) => [`${category} kategorisi ${nextMapping.printer || 'yazıcı seçilmedi'} yazıcısına bağlandı.`, ...current]);
  }

  function applyRawStockCount() {
    if (!selectedRawRow) return;

    const countedQuantity = Math.max(0, parseAmount(rawCountInput));
    const lastCountedAt = new Date().toISOString();
    const previousQuantity = selectedRawRow.invoiceQuantity;
    const difference = countedQuantity - previousQuantity;

    setRawCountOverrides((current) => ({
      ...current,
      [selectedRawRow.id]: {
        currentQuantity: String(countedQuantity),
        lastCountedAt,
      },
    }));
    setCreatedRawIngredients((current) => current.map((ingredient) =>
      ingredient.id === selectedRawRow.id
        ? { ...ingredient, currentQuantity: String(countedQuantity) }
        : ingredient,
    ));
    setSavedNotes((current) => [
      `${selectedRawRow.name} için sayım işlendi: ${formatQuantity(previousQuantity, selectedRawRow.unit)} → ${formatQuantity(countedQuantity, selectedRawRow.unit)}${difference === 0 ? '' : ` (${difference > 0 ? '+' : ''}${formatQuantity(Math.abs(difference), selectedRawRow.unit)} fark)`}.`,
      ...current,
    ]);
  }

  function applySaleStockCount() {
    if (!selectedProduct) return;

    const countedQuantity = Math.max(0, parseAmount(saleCountInput));
    const previousQuantity = parseAmount(selectedProduct.currentStock);
    const difference = countedQuantity - previousQuantity;
    const lastCountedAt = new Date().toISOString();

    setSaleProducts((current) => current.map((product) => {
      if (product.id !== selectedProduct.id) return product;

      if (product.stockProcurementType === 'direct' && product.barStockMode === 'bottle-glass') {
        const bottleMl = clToMl(parseAmount(product.bottleVolumeCl || '70'));
        const sealedBottleCount = Math.max(0, Math.floor(countedQuantity));
        const fractionalBottle = Math.max(0, countedQuantity - sealedBottleCount);
        const openMl = bottleMl > 0 ? fractionalBottle * bottleMl : 0;
        const openBottleSnapshots = openMl > 0
          ? [{ id: `counted-open-${Date.now()}`, openedAt: new Date().toISOString(), remainingMl: openMl }]
          : [];

        return {
          ...product,
          currentStock: String(sealedBottleCount),
          openBottleSnapshots,
          initialBottleCount: product.initialBottleCount || String(Math.max(0, countedQuantity)),
          lastCountedAt,
        };
      }

      return { ...product, currentStock: String(countedQuantity), lastCountedAt };
    }));

    if (selectedProduct.stockProcurementType === 'direct') {
      const directItemId = getSaleWarehouseItemId(selectedProduct.id);
      setWarehouseStocks((current) => {
        const mainItems = [...(current[MAIN_WAREHOUSE_ID] ?? [])];
        const lineIndex = mainItems.findIndex((line) => line.ingredientId === directItemId);

        if (lineIndex >= 0) {
          mainItems[lineIndex] = {
            ...mainItems[lineIndex],
            ingredientName: `${selectedProduct.name} (Satış ürünü)`,
            unit: getSaleProductWarehouseUnit(selectedProduct),
            quantity: selectedProduct.barStockMode === 'bottle-glass'
              ? Math.max(0, countedQuantity)
              : countedQuantity,
          };
        } else {
          mainItems.push({
            ingredientId: directItemId,
            ingredientName: `${selectedProduct.name} (Satış ürünü)`,
            unit: getSaleProductWarehouseUnit(selectedProduct),
            quantity: selectedProduct.barStockMode === 'bottle-glass'
              ? Math.max(0, countedQuantity)
              : countedQuantity,
          });
        }

        return {
          ...current,
          [MAIN_WAREHOUSE_ID]: mainItems,
        };
      });
    }

    setSavedNotes((current) => [
      `${selectedProduct.name} için mal sayımı işlendi: ${formatSaleStockQuantity(previousQuantity, selectedProduct.salesUnit)} → ${formatSaleStockQuantity(countedQuantity, selectedProduct.salesUnit)}${difference === 0 ? '' : ` (${difference > 0 ? '+' : ''}${formatSaleStockQuantity(Math.abs(difference), selectedProduct.salesUnit)} fark)`}.`,
      ...current,
    ]);
  }

  function applyBarProductUpdate(productId: string, mutator: (product: SaleProductCard) => SaleProductCard, note: string) {
    setSaleProducts((current) => current.map((product) => (product.id === productId ? mutator(product) : product)));
    setSavedNotes((current) => [note, ...current]);
    setSelectedBarProductId(productId);
    setBarControlMessage(note);
  }

  function openBarBottle() {
    if (!selectedBarActionProduct) {
      setBarControlMessage('Önce açılacak alkol ürününü seç.');
      return;
    }

    if (selectedBarActionProduct.stockProcurementType !== 'direct' || selectedBarActionProduct.barStockMode !== 'bottle-glass') {
      setBarControlMessage(`${selectedBarActionProduct.name} için önce satış ürününde "Direkt stok" ve "Şişeden kadeh çıkışı" ayarı yapılmalı.`);
      return;
    }

    const actionBottleMl = clToMl(parseAmount(selectedBarActionProduct.bottleVolumeCl || '70'));
    const actionSealedBottleCount = Math.max(0, Math.floor(parseAmount(selectedBarActionProduct.currentStock || '0')));
    const requestedOpenCount = Math.max(1, Math.floor(parseAmount(barOpenBottleCount)));
    const openCount = Math.min(requestedOpenCount, actionSealedBottleCount);

    if (openCount <= 0 || actionBottleMl <= 0) {
      setBarControlMessage('Açılacak kapalı şişe yok.');
      return;
    }

    applyBarProductUpdate(
      selectedBarActionProduct.id,
      (product) => ({
        ...product,
        currentStock: String(Math.max(0, Math.floor(parseAmount(product.currentStock || '0')) - openCount)),
        openBottleSnapshots: [
          ...product.openBottleSnapshots,
          ...Array.from({ length: openCount }, (_, index) => ({
            id: `manual-open-${Date.now()}-${index}`,
            openedAt: new Date().toISOString(),
            remainingMl: actionBottleMl,
          })),
        ],
        lastCountedAt: new Date().toISOString(),
      }),
      requestedOpenCount > openCount
        ? `${selectedBarActionProduct.name} için ${openCount} şişe açıldı (istenen: ${requestedOpenCount}, elde kalan: ${actionSealedBottleCount}).`
        : `${selectedBarActionProduct.name} için ${openCount} şişe açıldı.`,
    );
  }

  function saveBarManualAdjustment() {
    if (!selectedBarProduct) return;

    const sealedCount = Math.max(0, Math.floor(parseAmount(barManualSealedCount)));
    const nextRemainingMl = Math.min(selectedBarProduct.bottleMl, Math.max(0, clToMl(parseAmount(barManualBottleRemainingCl))));

    applyBarProductUpdate(
      selectedBarProduct.product.id,
      (product) => {
        const nextOpenBottles = [...product.openBottleSnapshots];
        const bottleIndex = nextOpenBottles.findIndex((item) => item.id === selectedBarBottleId);

        if (bottleIndex >= 0) {
          if (nextRemainingMl <= 0) {
            nextOpenBottles.splice(bottleIndex, 1);
          } else {
            nextOpenBottles[bottleIndex] = { ...nextOpenBottles[bottleIndex], remainingMl: nextRemainingMl };
          }
        } else if (nextRemainingMl > 0) {
          nextOpenBottles.push({
            id: `manual-bottle-${Date.now()}`,
            openedAt: new Date().toISOString(),
            remainingMl: nextRemainingMl,
          });
        }

        return {
          ...product,
          currentStock: String(sealedCount),
          openBottleSnapshots: nextOpenBottles.filter((item) => item.remainingMl > 0),
          lastCountedAt: new Date().toISOString(),
        };
      },
      `${selectedBarProduct.product.name} manuel düzeltmesi kaydedildi.`,
    );
  }

  function applyBarStockCheck() {
    if (!selectedBarProduct) return;

    const countedQuantity = Math.max(0, parseAmount(barStockCheckInput));
    const sealedBottleCount = Math.max(0, Math.floor(countedQuantity));
    const fractionalBottle = Math.max(0, countedQuantity - sealedBottleCount);
    const openMl = selectedBarProduct.bottleMl > 0 ? fractionalBottle * selectedBarProduct.bottleMl : 0;

    applyBarProductUpdate(
      selectedBarProduct.product.id,
      (product) => ({
        ...product,
        currentStock: String(sealedBottleCount),
        openBottleSnapshots: openMl > 0
          ? [{ id: `counted-open-${Date.now()}`, openedAt: new Date().toISOString(), remainingMl: openMl }]
          : [],
        lastCountedAt: new Date().toISOString(),
      }),
      `${selectedBarProduct.product.name} stok sayımı işlendi.`,
    );
  }

  function moveRecipeToSaleProducts(recipeIds?: string[]) {
    const targetRecipeIds = (recipeIds && recipeIds.length > 0 ? recipeIds : selectedPoolRecipeIds.length > 0 ? selectedPoolRecipeIds : selectedPoolRecipe ? [selectedPoolRecipe.id] : [])
      .filter(Boolean);
    if (targetRecipeIds.length === 0) return;

    let lastSelectedProductId = '';
    const messages: string[] = [];
    const movedCategories = new Set<string>();

    setSaleProducts((current) => {
      let nextProducts = [...current];

      targetRecipeIds.forEach((recipeId) => {
        const template = recipePool.find((item) => item.id === recipeId);
        const version = getLatestPublishedRecipeVersion(recipeId, recipeVersions);
        if (!template || !version) return;

        const recipeProductName = template.name.split('/').pop()?.trim() || template.name;
        const recipeCategory = template.category || inferCategory(recipeProductName);
        movedCategories.add(recipeCategory);
        const normalizedPrice = Math.max(
          0,
          version.ingredients.reduce((sum, line) => {
            const ingredient = getIngredient(line.ingredientId);
            const stock = invoiceStocks.find((item) => item.ingredientId === line.ingredientId);
            const qty = parseAmount(line.qty);
            const baseQty = convertToIngredientBaseUnit(qty, line.unit, ingredient?.unit ?? line.unit);
            return sum + (stock?.averageCost ?? 0) * baseQty;
          }, 0) * 2.35,
        );

        const existingProduct = nextProducts.find(
          (product) => product.recipeId === recipeId || product.name.toLocaleLowerCase('tr-TR') === recipeProductName.toLocaleLowerCase('tr-TR'),
        );

        if (existingProduct) {
          nextProducts = nextProducts.map((product) =>
            product.id === existingProduct.id
              ? {
                  ...product,
                  name: recipeProductName,
                  category: recipeCategory,
                  recipeId,
                  stockProcurementType: 'recipe',
                  recipeOverrides: [],
                  recipeOverride: false,
                }
              : product,
          );
          lastSelectedProductId = existingProduct.id;
          messages.push(`${template.name} mevcut satış ürününe bağlandı.`);
          return;
        }

        const nextId = `sale-from-${recipeId}`;
        const nextProduct: SaleProductCard = {
          id: nextId,
          name: recipeProductName,
          category: recipeCategory,
          productType: 'sale_product',
          salesUnit: 'portion',
          currentStock: '0',
          lastCountedAt: undefined,
          stockProcurementType: 'recipe',
          barStockMode: 'none',
          glassesPerBottle: '6',
          bottleVolumeCl: '70',
          portionVolumeCl: '5',
          initialBottleCount: '0',
          dispensedPortions: '0',
          openBottleSnapshots: [],
          salePrice: String(Math.round(normalizedPrice)),
          salePrice1: String(Math.round(normalizedPrice)),
          salePrice2: String(Math.round(normalizedPrice)),
          salePrice3: String(Math.round(normalizedPrice)),
          price1WindowEnabled: true,
          price1Start: '',
          price1End: '',
          price2WindowEnabled: false,
          price2Start: '',
          price2End: '',
          allowComplimentary: true,
          allowDiscount: true,
          fixedMenu: false,
          happyHourEligible: true,
          eventPriceEligible: true,
          vatRate: 10,
          salesCount: 0,
          recipeLines: version.ingredients.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: line.qty,
            unit: line.unit,
          })),
          recipeId,
          portionMultiplier: '1',
          recipeOverrides: [],
          recipeOverride: false,
          wastePercentage: '0',
          operationalCost: '0',
          source: 'created',
        };

        nextProducts = [nextProduct, ...nextProducts];
        lastSelectedProductId = nextId;
        messages.push(`${template.name} satış ürünlerine aktarıldı.`);
      });

      return nextProducts;
    });

    if (lastSelectedProductId) {
      setSelectedProductId(lastSelectedProductId);
    }
    setSelectedPoolRecipeIds([]);
    if (movedCategories.size > 0) {
      setCategories((current) => {
        const next = [...current];
        movedCategories.forEach((category) => {
          if (!next.some((item) => item.toLocaleLowerCase('tr-TR') === category.toLocaleLowerCase('tr-TR'))) {
            next.push(category);
          }
        });
        return next;
      });
    }
    changeActiveWindow('sale');
    if (messages.length > 0) {
      setSavedNotes((current) => [...messages.reverse(), ...current]);
    }
  }

  function createTemplateFromSelectedProduct() {
    if (!selectedProduct) return;

    const recipeName = `${selectedProduct.category} / ${selectedProduct.name}`;
    const existingRecipe = recipePool.find(
      (recipe) => recipe.name.toLocaleLowerCase('tr-TR') === recipeName.toLocaleLowerCase('tr-TR'),
    );

    if (existingRecipe) {
      setSelectedPoolRecipeId(existingRecipe.id);
      changeActiveWindow('recipe');
      setSavedNotes((current) => [`${existingRecipe.name} reçete havuzunda zaten mevcut.`, ...current]);
      return;
    }

    const recipeId = `recipe-template-${Date.now()}`;
    const nextRecipe: RecipePoolRecipe = {
      id: recipeId,
      name: recipeName,
      category: selectedProduct.category,
      status: 'active',
    };
    const nextVersion: RecipePoolVersion = {
      id: `recipe-version-${recipeId}-1`,
      recipeId,
      versionNo: 1,
      published: true,
      ingredients: selectedProductRecipeLines.length > 0
        ? selectedProductRecipeLines.map((line) => ({
            ingredientId: line.ingredientId,
            qty: line.quantity,
            unit: line.unit,
          }))
        : selectedProductSuggestions.slice(0, 3).map((ingredient) => ({
            ingredientId: ingredient.id,
            qty: ingredient.unit === 'ml' || ingredient.unit === 'gr' ? '100' : '1',
            unit: ingredient.unit as RecipePoolUnit,
          })),
    };

    setRecipePool((current) => [nextRecipe, ...current]);
    setRecipeVersions((current) => [nextVersion, ...current]);
    setSelectedPoolRecipeId(recipeId);
    changeActiveWindow('recipe');
    setSaleProducts((current) =>
      current.map((product) =>
        product.id === selectedProduct.id
          ? { ...product, recipeId, recipeOverrides: [], recipeOverride: false }
          : product,
      ),
    );
    setSavedNotes((current) => [
      `${nextRecipe.name} reçete havuzuna eklendi.${nextVersion.ingredients.length === 0 ? ' İçerik boş oluşturuldu, malzemeleri ekleyin.' : ''}`,
      ...current,
    ]);
  }

  function addCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const allowed = getCategoryDomainDefinition(trimmed).allowedProductTypes;
    if (!allowed.includes(activeDraftProductType)) {
      setSavedNotes((current) => [
        `${trimmed} kategorisi ${activeDraftProductType} için uygun değil. Bu akış için ${getDefaultCategoryForProductType(activeDraftProductType)} kullanın.`,
        ...current,
      ]);
      return;
    }
    if (categories.some((category) => category.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr'))) {
      setSavedNotes((current) => [`${trimmed} kategorisi zaten mevcut.`, ...current]);
      return;
    }

    setCategories((current) => [...current, trimmed]);
    setNewItemDraft((current) => ({ ...current, category: trimmed }));
    if (selectedProduct) updateSelectedProduct({ category: trimmed });
    setSavedNotes((current) => [`${trimmed} kategorisi oluşturuldu.`, ...current]);
    setNewCategoryName('');
  }

  function updateSelectedPoolRecipe(patch: Partial<RecipePoolRecipe>) {
    if (!selectedPoolRecipe) return;
    setRecipePool((current) =>
      current.map((recipe) =>
        recipe.id === selectedPoolRecipe.id
          ? {
              ...recipe,
              ...patch,
              name: patch.category && recipe.name.includes('/')
                ? `${patch.category} / ${recipe.name.split('/').pop()?.trim() || recipe.name}`
                : patch.name ?? recipe.name,
            }
          : recipe,
      ),
    );
    if (patch.category) {
      const nextCategory = patch.category;
      setCategories((current) =>
        current.some((category) => category.toLocaleLowerCase('tr-TR') === nextCategory.toLocaleLowerCase('tr-TR'))
          ? current
          : [...current, nextCategory],
      );
      setSelectedRecipeCategory(nextCategory);
    }
  }

  function resetNewItemDraft(nextType: CreateItemType = 'sale') {
    const nextProductType = productTypeForCreateItemType(nextType);
    const defaultCategory = coerceCategoryForProductType(getDefaultCategoryForProductType(nextProductType), nextProductType, categories);
    setNewItemDraft({
      itemType: nextType,
      name: '',
      category: defaultCategory,
      salesUnit: 'portion',
      salePrice: '0',
      purchasePrice: '0',
      vatRate: nextType === 'raw' || nextType === 'semi' ? 20 : 10,
      unit: 'adet',
      minimumQuantity: '0',
      currentQuantity: '0',
    });
  }

  function changeActiveWindow(nextWindow: ProductWindow) {
    setActiveWindow(nextWindow);
    setShowNewItemForm(false);
    setShowQuickCreate(false);

    if (nextWindow === 'raw' && !selectedRawId && rawInventoryRows[0]) {
      setSelectedRawId(rawInventoryRows[0].id);
    }

    if (nextWindow === 'sale' && !selectedProductId && saleProducts[0]) {
      setSelectedProductId(saleProducts[0].id);
    }

    if (nextWindow === 'quick' && saleProducts[0]) {
      setQuickListMode('add');
    }

    if (nextWindow === 'bar' && !selectedBarProductId && barDashboardItems[0]) {
      setSelectedBarProductId(barDashboardItems[0].product.id);
    }

    if (nextWindow === 'recipe' && !selectedPoolRecipeId && recipePool[0]) {
      setSelectedPoolRecipeId(recipePool[0].id);
    }

    if (nextWindow === 'warehouse' && !selectedWarehouseId) {
      setSelectedWarehouseId(MAIN_WAREHOUSE_ID);
    }
  }

  function addDepartmentWarehouse() {
    const trimmed = newDepartmentName.trim();
    if (!trimmed) return;
    const newWarehouse: WarehouseModel = {
      id: `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      type: 'department',
      createdAt: new Date().toISOString(),
      description: 'Departman deposu',
    };
    setWarehouses((current) => [...current, newWarehouse]);
    setSelectedWarehouseId(newWarehouse.id);
    setTransferToWarehouseId(newWarehouse.id);
    setNewDepartmentName('');
    setSavedNotes((current) => [`${trimmed} departman deposu oluşturuldu.`, ...current]);
  }

  function executeWarehouseTransfer() {
    const ingredientLine = transferSourceStock.find((line) => line.ingredientId === transferIngredientId);
    const quantity = transferIsReturnToMain
      ? Math.max(0, parseAmount(transferCountInput))
      : Math.max(0, parseAmount(transferQuantity));

    if (!transferFromWarehouseId || !transferToWarehouseId || !ingredientLine) {
      setWarehouseTransferError('Kaynak, hedef depo ve ürün seçimi zorunlu.');
      setWarehouseTransferMessage('');
      return;
    }

    if (!transferDeliveredBy.trim() || !transferReceivedBy.trim()) {
      setWarehouseTransferError('Teslim eden ve teslim alan personel zorunlu.');
      setWarehouseTransferMessage('');
      return;
    }

    if (quantity <= 0) {
      setWarehouseTransferError('Teslim miktarı sıfırdan büyük olmalı.');
      setWarehouseTransferMessage('');
      return;
    }

    const result = executeTransfer({
      allStocks: warehouseStocks,
      warehouses,
      fromWarehouseId: transferFromWarehouseId,
      toWarehouseId: transferToWarehouseId,
      ingredientId: ingredientLine.ingredientId,
      ingredientName: ingredientLine.ingredientName,
      unit: ingredientLine.unit,
      quantity,
      deliveredBy: transferDeliveredBy,
      receivedBy: transferReceivedBy,
      note: transferNote,
    });

    if (!result.ok) {
      setWarehouseTransferError(result.error);
      setWarehouseTransferMessage('');
      return;
    }

    setWarehouseStocks(result.updatedStocks);
    setWarehouseTransfers((current) => [result.record, ...current]);
    setWarehouseTransferError('');
    setWarehouseTransferMessage(`${result.record.fromWarehouseName} → ${result.record.toWarehouseName} transferi işlendi: ${formatQuantity(result.record.quantity, result.record.unit)}.`);
    setTransferIngredientSearch('');
    setTransferIngredientId('');
    setTransferQuantity('');
    setTransferCountInput('');
    setTransferNote('');
  }

  function togglePoolRecipeSelection(recipeId: string) {
    setSelectedPoolRecipeIds((current) =>
      current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId],
    );
  }

  function updateBulkDraft(value: string) {
    setBulkDrafts((current) => ({ ...current, raw: value }));
  }

  function downloadQuickCreateTemplate() {
    if (!quickCreateEnabled) return;
    const headerRow = ['Kart adı', 'Birim', 'Alış fiyatı', 'Minimum stok', 'Mevcut stok'];
    const sampleRows = [
      ['Kahve Çekirdeği', 'kg', '520', '15', '20'],
      ['Süt', 'lt', '42', '18', '36'],
    ];

    const csv = ['\uFEFF' + headerRow.join(';'), ...sampleRows.map((row) => row.join(';'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hammadde-sablonu.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importQuickCreateFile(file: File) {
    if (!quickCreateEnabled) return;
    const text = await file.text();
    updateBulkDraft(text.replace(/^\uFEFF/, ''));
    setBulkFileNames((current) => ({ ...current, raw: file.name }));
  }

  async function handleQuickCreateFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    await importQuickCreateFile(file);
    event.target.value = '';
  }

  function applyQuickCreate() {
    if (quickCreateRows.length === 0) return;
    if (quickCreateAnalysis.invalidCount > 0) {
      setSavedNotes((current) => [
        `${quickCreateAnalysis.invalidCount} hatalı satır var. İçe aktarmadan önce dosyayı düzelt.`,
        ...current,
      ]);
      return;
    }

    if (activeWindow === 'raw') {
      const existingNames = new Set(rawInventoryRows.map((row) => row.name.trim().toLocaleLowerCase('tr-TR')));
      const createdAt = Date.now();
      const additions: CreatedRawIngredient[] = [];
      let skipped = 0;

      quickCreateRows.forEach((cells, index) => {
        const name = (cells[0] ?? '').trim();
        if (!name) return;

        const normalizedName = name.toLocaleLowerCase('tr-TR');
        if (existingNames.has(normalizedName)) {
          skipped += 1;
          return;
        }

        const normalizedUnit = normalizeRawUnit(cells[1] ?? 'adet');
        const purchasePrice = String(parseAmount(cells[2] || '0') || 0);
        const minimumQuantity = String(parseAmount(cells[3] || '0') * normalizedUnit.multiplier || 0);
        const currentQuantity = String(parseAmount(cells[4] || '0') * normalizedUnit.multiplier || 0);

        additions.push({
          id: `raw-bulk-${createdAt}-${index}`,
          name,
          productType: 'stock_item',
          unit: normalizedUnit.unit,
          purchasePrice,
          minimumQuantity,
          currentQuantity,
          vatRate: 20,
        });
        existingNames.add(normalizedName);
      });

      if (additions.length > 0) {
        setCreatedRawIngredients((current) => [...additions, ...current]);
        setSelectedRawId(additions[0].id);
      }

      setSavedNotes((current) => [
        `${additions.length} hammadde eklendi${skipped > 0 ? `, ${skipped} satır mevcut olduğu için atlandı` : ''}.`,
        ...current,
      ]);
      setBulkDrafts((current) => ({ ...current, raw: '' }));
      setBulkFileNames((current) => ({ ...current, raw: '' }));
      return;
    }

    const existingNames = new Set(saleProducts.map((product) => product.name.trim().toLocaleLowerCase('tr-TR')));
    const createdAt = Date.now();
    const additions: SaleProductCard[] = [];
    const newCategories = new Set<string>();
    let skipped = 0;

    quickCreateRows.forEach((cells, index) => {
      const name = (cells[0] ?? '').trim();
      if (!name) return;

      const normalizedName = name.toLocaleLowerCase('tr-TR');
      if (existingNames.has(normalizedName)) {
        skipped += 1;
        return;
      }

      const category = (cells[1] ?? '').trim() || inferCategory(name);
      const salePrice = (cells[2] ?? '').trim() || '0';
      const defaultDirect = inferDirectStockDefault(name, category);
      const defaultBottleMode = inferBarBottleGlassDefault(name, category);

      additions.push({
        id: `sale-bulk-${createdAt}-${index}`,
        name,
        category,
        productType: 'sale_product',
        salesUnit: 'portion',
        currentStock: '0',
        lastCountedAt: undefined,
        stockProcurementType: defaultDirect ? 'direct' : 'recipe',
        barStockMode: defaultBottleMode ? 'bottle-glass' : 'none',
        glassesPerBottle: '6',
        bottleVolumeCl: '70',
        portionVolumeCl: '5',
        initialBottleCount: '0',
        dispensedPortions: '0',
        openBottleSnapshots: [],
        salePrice,
        salePrice1: salePrice,
        salePrice2: salePrice,
        salePrice3: salePrice,
        price1WindowEnabled: true,
        price1Start: '',
        price1End: '',
        price2WindowEnabled: false,
        price2Start: '',
        price2End: '',
        allowComplimentary: true,
        allowDiscount: true,
        fixedMenu: false,
        happyHourEligible: true,
        eventPriceEligible: true,
        vatRate: 10,
        salesCount: 0,
        recipeLines: [],
        portionMultiplier: '1',
        recipeOverrides: [],
        wastePercentage: '0',
        operationalCost: '0',
        source: 'created',
      });
      newCategories.add(category);
      existingNames.add(normalizedName);
    });

    if (additions.length > 0) {
      setSaleProducts((current) => [...additions, ...current]);
      setSelectedProductId(additions[0].id);
      setCategories((current) => Array.from(new Set([...current, ...Array.from(newCategories)])));
    }

    setSavedNotes((current) => [
      `${additions.length} satış ürünü eklendi${skipped > 0 ? `, ${skipped} satır mevcut olduğu için atlandı` : ''}.`,
      ...current,
    ]);
    setBulkDrafts((current) => ({ ...current, sale: '' }));
    setBulkFileNames((current) => ({ ...current, sale: '' }));
  }

  function saveNewItem() {
    if (!newItemDraft.name.trim()) return;
    const draftProductType = productTypeForCreateItemType(newItemDraft.itemType);
    const coercedCategory = coerceCategoryForProductType(newItemDraft.category, draftProductType, categories);
    const validation = validateProductDomainGraph({
      name: newItemDraft.name.trim(),
      category: coercedCategory,
      productType: draftProductType,
      price: newItemDraft.salePrice,
    });
    if (!validation.ok) {
      setSavedNotes((current) => [
        `${newItemDraft.name.trim()} oluşturulmadı: ${validation.issues.map((issue) => issue.message).join(' ')}`,
        ...current,
      ]);
      setNewItemDraft((current) => ({ ...current, category: coercedCategory }));
      return;
    }

    if (newItemDraft.itemType === 'raw' || newItemDraft.itemType === 'semi') {
      const rawId = `raw-${Date.now()}`;
      const createdRaw: CreatedRawIngredient = {
        id: rawId,
        name: newItemDraft.name.trim(),
        unit: newItemDraft.unit,
        purchasePrice: newItemDraft.purchasePrice,
        minimumQuantity: newItemDraft.minimumQuantity,
        currentQuantity: newItemDraft.currentQuantity,
        vatRate: newItemDraft.vatRate,
        productType: draftProductType === 'semi_product' ? 'semi_product' : 'stock_item',
      };
      setCreatedRawIngredients((current) => [createdRaw, ...current]);
      setNewRecipeIngredientId(rawId);
      setSelectedRawId(rawId);
      setSavedNotes((current) => [
        newItemDraft.itemType === 'semi'
          ? `${createdRaw.name} yarı mamülü oluşturuldu. POS kataloğuna eklenmedi.`
          : `${createdRaw.name} hammaddesi oluşturuldu. POS kataloğuna eklenmedi.`,
        ...current,
      ]);
      changeActiveWindow('raw');
      setShowNewItemForm(false);
      resetNewItemDraft('sale');
      return;
    }

    if (newItemDraft.itemType === 'modifier' || newItemDraft.itemType === 'variant') {
      setSavedNotes((current) => [
        `${newItemDraft.name.trim()} ${newItemDraft.itemType === 'modifier' ? 'modifier grubu' : 'varyant grubu'} oluşturma taslağı kaydedildi. Bu domain POS ürün kartından bağımsız tutulur.`,
        ...current,
      ]);
      setShowNewItemForm(false);
      resetNewItemDraft('sale');
      return;
    }

    const nextId = `created-${Date.now()}`;
    const isGlassUnit = newItemDraft.salesUnit === 'glass';
    const createdProduct: SaleProductCard = {
      id: nextId,
      name: newItemDraft.name.trim(),
      category: coercedCategory,
      productType: draftProductType === 'combo_product' ? 'combo_product' : 'sale_product',
      salesUnit: newItemDraft.salesUnit,
      currentStock: '0',
      lastCountedAt: undefined,
      stockProcurementType: isGlassUnit || inferDirectStockDefault(newItemDraft.name, coercedCategory) ? 'direct' : 'recipe',
      barStockMode: isGlassUnit || inferBarBottleGlassDefault(newItemDraft.name, coercedCategory) ? 'bottle-glass' : 'none',
      glassesPerBottle: '6',
      bottleVolumeCl: '70',
      portionVolumeCl: '5',
      initialBottleCount: '0',
      dispensedPortions: '0',
      openBottleSnapshots: [],
      salePrice: newItemDraft.salePrice,
      salePrice1: newItemDraft.salePrice,
      salePrice2: newItemDraft.salePrice,
      salePrice3: newItemDraft.salePrice,
      price1WindowEnabled: true,
      price1Start: '',
      price1End: '',
      price2WindowEnabled: false,
      price2Start: '',
      price2End: '',
      allowComplimentary: true,
      allowDiscount: true,
      fixedMenu: false,
      happyHourEligible: true,
      eventPriceEligible: true,
      vatRate: newItemDraft.vatRate,
      salesCount: 0,
      recipeLines: [],
      portionMultiplier: '1',
      recipeOverrides: [],
      wastePercentage: '0',
      operationalCost: '0',
      source: 'created',
    };
    setSaleProducts((current) => [createdProduct, ...current]);
    setCategories((current) => current.some((category) => category.toLocaleLowerCase('tr-TR') === coercedCategory.toLocaleLowerCase('tr-TR')) ? current : [...current, coercedCategory]);
    setSelectedProductId(nextId);
    setSavedNotes((current) => [`${createdProduct.name} satış ürünü oluşturuldu. Şimdi reçetesini ekleyebilirsin.`, ...current]);
    changeActiveWindow('sale');
    setShowNewItemForm(false);
    resetNewItemDraft('sale');
  }

  function saveQuickSaleItem() {
    const trimmedName = quickSaleDraft.name.trim();
    if (!trimmedName) return;
    const quickCategory = coerceCategoryForProductType(quickSaleDraft.category, 'sale_product', categories);
    const quickValidation = validateProductDomainGraph({
      name: trimmedName,
      category: quickCategory,
      productType: 'sale_product',
      price: quickSaleDraft.salePrice,
    });
    if (!quickValidation.ok) {
      setSavedNotes((current) => [
        `${trimmedName} eklenmedi: ${quickValidation.issues.map((issue) => issue.message).join(' ')}`,
        ...current,
      ]);
      setQuickSaleDraft((current) => ({ ...current, category: quickCategory }));
      return;
    }

    const nameExists = saleProducts.some(
      (product) => product.name.trim().toLocaleLowerCase('tr-TR') === trimmedName.toLocaleLowerCase('tr-TR'),
    );

    if (nameExists) {
      setSavedNotes((current) => [`${trimmedName} zaten mevcut, yeni kart açılmadı.`, ...current]);
      return;
    }

    const nextId = `quick-sale-${Date.now()}`;
    const isGlassUnit = quickSaleDraft.salesUnit === 'glass';
    const createdProduct: SaleProductCard = {
      id: nextId,
      name: trimmedName,
      category: quickCategory,
      productType: 'sale_product',
      salesUnit: quickSaleDraft.salesUnit,
      currentStock: '0',
      lastCountedAt: undefined,
      stockProcurementType: isGlassUnit || inferDirectStockDefault(trimmedName, quickCategory) ? 'direct' : 'recipe',
      barStockMode: isGlassUnit || inferBarBottleGlassDefault(trimmedName, quickCategory) ? 'bottle-glass' : 'none',
      glassesPerBottle: '6',
      bottleVolumeCl: '70',
      portionVolumeCl: '5',
      initialBottleCount: '0',
      dispensedPortions: '0',
      openBottleSnapshots: [],
      salePrice: quickSaleDraft.salePrice,
      salePrice1: quickSaleDraft.salePrice,
      salePrice2: quickSaleDraft.salePrice,
      salePrice3: quickSaleDraft.salePrice,
      price1WindowEnabled: true,
      price1Start: '',
      price1End: '',
      price2WindowEnabled: false,
      price2Start: '',
      price2End: '',
      allowComplimentary: true,
      allowDiscount: true,
      fixedMenu: false,
      happyHourEligible: true,
      eventPriceEligible: true,
      vatRate: quickSaleDraft.vatRate,
      salesCount: 0,
      recipeLines: [],
      portionMultiplier: '1',
      recipeOverrides: [],
      wastePercentage: '0',
      operationalCost: '0',
      source: 'created',
    };

    setSaleProducts((current) => [createdProduct, ...current]);
    setSelectedProductId(nextId);
    setCategories((current) => {
      if (current.some((category) => category.toLocaleLowerCase('tr-TR') === quickCategory.toLocaleLowerCase('tr-TR'))) {
        return current;
      }
      return [...current, quickCategory];
    });
    setQuickSaleDraft((current) => ({ ...current, name: '', salePrice: '0' }));
    setSavedNotes((current) => [`${trimmedName} hızlı ekleme ile satış ürünlerine eklendi.`, ...current]);
  }

  function buildDuplicateProductName(baseName: string) {
    const existingNames = new Set(
      saleProducts.map((product) => product.name.trim().toLocaleLowerCase('tr-TR')),
    );

    const firstCandidate = `${baseName} Kopya`;
    if (!existingNames.has(firstCandidate.toLocaleLowerCase('tr-TR'))) {
      return firstCandidate;
    }

    let index = 2;
    while (index < 500) {
      const candidate = `${baseName} Kopya ${index}`;
      if (!existingNames.has(candidate.toLocaleLowerCase('tr-TR'))) {
        return candidate;
      }
      index += 1;
    }

    return `${baseName} Kopya ${Date.now()}`;
  }

  function duplicateQuickSaleItem() {
    const source = saleProducts.find((product) => product.id === quickDuplicateSourceId);
    if (!source) return;

    const duplicatedName = buildDuplicateProductName(source.name);
    const nextId = `quick-copy-${Date.now()}`;
    const baseDuplicate: SaleProductCard = {
      ...source,
      id: nextId,
      name: duplicatedName,
      productType: source.productType ?? 'sale_product',
      currentStock: '0',
      lastCountedAt: undefined,
      initialBottleCount: '0',
      dispensedPortions: '0',
      openBottleSnapshots: [],
      salesCount: 0,
      source: 'created',
    };

    const duplicatedProduct: SaleProductCard = quickDuplicateMode === 'price-only'
      ? {
          ...baseDuplicate,
          stockProcurementType: 'recipe',
          barStockMode: 'none',
          glassesPerBottle: '6',
          bottleVolumeCl: '70',
          portionVolumeCl: '5',
          allowComplimentary: true,
          allowDiscount: true,
          fixedMenu: false,
          happyHourEligible: true,
          eventPriceEligible: true,
          recipeLines: [],
          recipeId: undefined,
          recipeOverrides: [],
          recipeOverride: false,
          wastePercentage: '0',
          operationalCost: '0',
        }
      : {
          ...baseDuplicate,
          recipeId: quickDuplicateWithRecipe ? source.recipeId : undefined,
          recipeLines: quickDuplicateWithRecipe ? source.recipeLines : [],
          recipeOverrides: quickDuplicateWithRecipe ? source.recipeOverrides : [],
          recipeOverride: quickDuplicateWithRecipe ? source.recipeOverride : false,
        };

    setSaleProducts((current) => [duplicatedProduct, ...current]);
    setSelectedProductId(nextId);
    setSavedNotes((current) => [
      `${source.name} ürünü çoğaltıldı: ${duplicatedName} (${quickDuplicateMode === 'price-only' ? 'sadece fiyat kopyası' : quickDuplicateWithRecipe ? 'reçete dahil' : 'reçetesiz kopya'}).`,
      ...current,
    ]);
  }

  function saveQuickPriceBatch() {
    const pending = quickPriceProducts.filter((product) => {
      const currentPrice = product.salePrice1 || product.salePrice;
      const draftPrice = (quickPriceDrafts[product.id] ?? currentPrice).trim();
      return draftPrice && draftPrice.trim() !== currentPrice.trim();
    });

    if (pending.length === 0) {
      setSavedNotes((current) => ['Toplu fiyat kaydı için değişiklik yok.', ...current]);
      return;
    }

    setSaleProducts((current) =>
      current.map((product) => {
        const draftPrice = quickPriceDrafts[product.id]?.trim();
        if (!draftPrice) return product;

        const currentPrice = product.salePrice1 || product.salePrice;
        if (draftPrice.trim() === currentPrice.trim()) return product;

        return {
          ...product,
          salePrice: draftPrice,
          salePrice1: draftPrice,
        };
      }),
    );

    setSavedNotes((current) => [`${pending.length} ürünün fiyatı toplu olarak güncellendi.`, ...current]);
  }

  function ensureRecipeForProduct(product: SaleProductCard, lines: SaleProductRecipeLine[]) {
    if (product.recipeId) {
      return product.recipeId;
    }

    const recipeId = `recipe-${product.id}-${Date.now()}`;
    const nextRecipe: RecipePoolRecipe = {
      id: recipeId,
      name: `${product.category} / ${product.name}`,
      category: product.category,
      status: 'active',
    };
    const nextVersion: RecipePoolVersion = {
      id: `recipe-version-${recipeId}-1`,
      recipeId,
      versionNo: 1,
      published: true,
      ingredients: lines.map((line) => ({
        ingredientId: line.ingredientId,
        qty: line.quantity,
        unit: line.unit,
      })),
    };

    setRecipePool((current) => [nextRecipe, ...current]);
    setRecipeVersions((current) => [nextVersion, ...current]);
    return recipeId;
  }

  function writeProductRecipeLines(nextLines: SaleProductRecipeLine[]) {
    if (!selectedProduct) return;

    const currentProduct = selectedProduct;
    const recipeId = ensureRecipeForProduct(currentProduct, currentProduct.recipeLines);
    const baseLines = getProductBaseRecipeLines({ ...currentProduct, recipeId }, recipeVersions).map((line) => ({
      ingredientId: line.ingredientId,
      qty: line.quantity,
      unit: line.unit,
    }));
    const overrides = buildRecipeOverrides(
      baseLines,
      nextLines.map((line) => ({
        ingredientId: line.ingredientId,
        qty: line.quantity,
        unit: line.unit,
      })),
    );

    setSaleProducts((current) =>
      current.map((product) =>
        product.id === currentProduct.id
          ? {
              ...product,
              recipeId,
              recipeOverrides: overrides,
              recipeOverride: overrides.length > 0,
            }
          : product,
      ),
    );
  }

  function publishSelectedRecipeVersion() {
    if (!selectedProduct || !selectedProduct.recipeId || selectedProductRecipeLines.length === 0) return;

    const recipeId = selectedProduct.recipeId;
    const latestVersionNo =
      recipeVersions
        .filter((version) => version.recipeId === recipeId)
        .reduce((max, version) => Math.max(max, version.versionNo), 0) + 1;

    const nextVersion: RecipePoolVersion = {
      id: `recipe-version-${recipeId}-${latestVersionNo}`,
      recipeId,
      versionNo: latestVersionNo,
      published: true,
      ingredients: selectedProductRecipeLines.map((line) => ({
        ingredientId: line.ingredientId,
        qty: line.quantity,
        unit: line.unit,
      })),
    };

    setRecipeVersions((current) => [
      ...current.map((version) =>
        version.recipeId === recipeId ? { ...version, published: false } : version,
      ),
      nextVersion,
    ]);
    setSavedNotes((current) => [`${selectedProduct.name} için reçete sürüm ${latestVersionNo} yayınlandı.`, ...current]);
  }

  function updatePoolDraftLine(index: number, patch: Partial<RecipePoolIngredientLine>) {
    setPoolDraftLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function removePoolDraftLine(index: number) {
    setPoolDraftLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function addPoolDraftLine() {
    if (!newRecipeIngredientId) return;
    const quantity = newRecipeQuantity.trim();
    if (!quantity) return;

    setPoolDraftLines((current) => [
      ...current,
      {
        ingredientId: newRecipeIngredientId,
        qty: quantity,
        unit: getIngredient(newRecipeIngredientId)?.unit ?? 'adet',
      },
    ]);
    setNewRecipeQuantity('1');
    setNewRecipeIngredientId('');
    setNewRecipeIngredientQuery('');
  }

  function publishPoolDraftVersion() {
    if (!selectedPoolRecipe || poolDraftLines.length === 0) return;

    const latestVersionNo =
      recipeVersions
        .filter((version) => version.recipeId === selectedPoolRecipe.id)
        .reduce((max, version) => Math.max(max, version.versionNo), 0) + 1;

    const nextVersion: RecipePoolVersion = {
      id: `recipe-version-${selectedPoolRecipe.id}-${latestVersionNo}`,
      recipeId: selectedPoolRecipe.id,
      versionNo: latestVersionNo,
      published: true,
      ingredients: poolDraftLines.map((line) => ({ ...line })),
    };

    setRecipeVersions((current) => [
      ...current.map((version) =>
        version.recipeId === selectedPoolRecipe.id ? { ...version, published: false } : version,
      ),
      nextVersion,
    ]);
    setSavedNotes((current) => [`${selectedPoolRecipe.name} için sürüm ${latestVersionNo} yayınlandı.`, ...current]);
  }

  function addRecipeLine() {
    if (!selectedProduct || !newRecipeIngredientId) return;
    const quantity = newRecipeQuantity.trim();
    if (!quantity) return;

    writeProductRecipeLines([
      ...selectedProductRecipeLines,
      {
        ingredientId: newRecipeIngredientId,
        quantity,
        unit: getIngredient(newRecipeIngredientId)?.unit ?? 'adet',
      },
    ]);
    const ingredient = ingredientOptions.find((item) => item.id === newRecipeIngredientId);
    setSavedNotes((current) => [`${selectedProduct.name} reçetesine ${ingredient?.name ?? newRecipeIngredientId} eklendi.`, ...current]);
    setNewRecipeQuantity('1');
    setNewRecipeIngredientId('');
    setNewRecipeIngredientQuery('');
  }

  function addSuggestedIngredient(ingredientId: string) {
    if (!selectedProduct) return;
    const ingredient = ingredientOptions.find((item) => item.id === ingredientId);
    if (!ingredient) return;

    writeProductRecipeLines([
      ...selectedProductRecipeLines,
      {
        ingredientId,
        quantity: '1',
        unit: ingredient.unit,
      },
    ]);

    setSavedNotes((current) => [`${selectedProduct.name} için ${ingredient.name} önerisi eklendi.`, ...current]);
  }

  function updateRecipeLine(index: number, patch: Partial<SaleProductRecipeLine>) {
    if (!selectedProduct) return;
    writeProductRecipeLines(
      selectedProductRecipeLines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeRecipeLine(index: number) {
    if (!selectedProduct) return;
    writeProductRecipeLines(selectedProductRecipeLines.filter((_, lineIndex) => lineIndex !== index));
  }

  if (!hydrated) {
    return null;
  }

  return (
    <AppShell
      title="Ürün, reçete ve stok yönetimi"
      subtitle="Satış ürünleri reçete havuzundan seçilerek POS ürünlerine aktarılır. Hammadde kartları ayrı yönetilir."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {activeWindow === 'sale' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  resetNewItemDraft('sale');
                  setShowNewItemForm((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition hover:bg-blue-500 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> Satış ürünü ekle
              </button>
              <button type="button" onClick={() => changeActiveWindow('recipe')} className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.25)] transition hover:bg-violet-500 active:scale-[0.98]">
                <Layers3 className="h-4 w-4" /> Reçete havuzundan ürün ekle
              </button>
              <a href="/products/templates" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                <Sparkles className="h-4 w-4" /> Global şablon havuzu
              </a>
              <a href="/onboarding" className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20">
                <PackageCheck className="h-4 w-4" /> Akıllı kurulum
              </a>
            </>
          ) : null}
          {quickCreateEnabled ? (
            <>
              <button type="button" onClick={() => setShowQuickCreate((current) => !current)} className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 active:scale-[0.98]">
                <Upload className="h-4 w-4" /> Excel aktarımı
              </button>
              <button type="button" onClick={() => setShowNewItemForm((current) => !current)} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition hover:bg-blue-500 active:scale-[0.98]">
                <Plus className="h-4 w-4" /> Yeni hammadde
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ['Satış ürünü', saleProducts.length.toString(), 'POS ve menü kartları'],
            ['Hammadde', rawInventoryRows.length.toString(), 'Depo ve üretim kalemi'],
            ['Kategori', categories.length.toString(), 'Sabit + yeni eklenen'],
            ['Günlük alış faturası', formatTRY(dailyPurchaseInvoiceTotal), dailyPurchaseInvoiceCount > 0 ? `${dailyPurchaseInvoiceCount} fatura işlendi` : 'Bugün kayıt yok'],
          ].map(([label, value, meta]) => (
            <article key={label} className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
              <p className="mt-2 text-xs text-slate-500">{meta}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-[#101B30] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Product Creation Studio</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Ne oluşturmak istiyorsunuz?</h2>
              <p className="mt-2 text-sm text-slate-400">Her domain kendi kurallarıyla açılır; hammadde POS'a, satış ürünü stok girişine karışmaz.</p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              productType kilitli
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {productCreationOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => openProductCreationStudio(option.id)}
                  className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.98] ${option.tone}`}
                >
                  <span className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold">{option.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-current/75">{option.subtitle}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {showNewItemForm ? (
          <ProductCardForm
            eyebrow="Product Creation Studio"
            title={`${activeCreationOption.title} oluştur`}
            description={`${activeCreationOption.subtitle} Kategori: ${selectedDraftCategoryDefinition.name}; izinli tipler: ${selectedDraftCategoryDefinition.allowedProductTypes.join(', ')}${selectedDraftDomainValidation.ok ? '' : ' — bu seçim düzeltilmeli.'}`}
            onClose={() => setShowNewItemForm(false)}
            itemType={newItemDraft.itemType}
            onItemTypeChange={(value) => resetNewItemDraft(value)}
            itemTypeOptions={productCreationOptions.map((option) => option.id)}
            name={newItemDraft.name}
            onNameChange={(value) => updateNewItemDraft('name', value)}
            category={newItemDraft.category}
            onCategoryChange={(value) => updateNewItemDraft('category', value)}
            categoryOptions={activeDraftCategoryOptions}
            saleUnit={newItemDraft.salesUnit}
            onSaleUnitChange={(value) => updateNewItemDraft('salesUnit', value)}
            salePrice={newItemDraft.salePrice}
            onSalePriceChange={(value) => updateNewItemDraft('salePrice', value)}
            purchasePrice={newItemDraft.purchasePrice}
            onPurchasePriceChange={(value) => updateNewItemDraft('purchasePrice', value)}
            showPurchasePrice={newItemDraft.itemType === 'raw' || newItemDraft.itemType === 'semi'}
            vatRate={newItemDraft.vatRate}
            onVatRateChange={(value) => updateNewItemDraft('vatRate', value)}
            showVat
            unit={newItemDraft.unit}
            onUnitChange={(value) => updateNewItemDraft('unit', value as RawUnit)}
            minimumQuantity={newItemDraft.minimumQuantity}
            onMinimumQuantityChange={(value) => updateNewItemDraft('minimumQuantity', value)}
            currentQuantity={newItemDraft.currentQuantity}
            onCurrentQuantityChange={(value) => updateNewItemDraft('currentQuantity', value)}
            showCurrentQuantity={newItemDraft.itemType === 'raw' || newItemDraft.itemType === 'semi'}
            newCategoryName={newCategoryName}
            onNewCategoryNameChange={setNewCategoryName}
            categoryCount={categories.length}
            onCreateCategory={addCategory}
            submitLabel={`${activeCreationOption.title} oluştur`}
            onSubmit={saveNewItem}
          />
        ) : null}

        {showQuickCreate && quickCreateEnabled ? (
          <section className="rounded-[1.75rem] border border-emerald-400/20 bg-[#13213A] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_38px_rgba(16,185,129,0.12)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Excel aktarımı</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Hammaddeleri Excel ile toplu ekle
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Önce şablonu indir, Excel’de hücreleri doldur, sonra aynı dosyayı içe aktar.
                  {' '}Kolon sırası: Kart adı, Birim, Alış fiyatı, Minimum stok, Mevcut stok.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickCreate(false)}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Kapat
              </button>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_0.65fr]">
              <div>
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Şablonu indir</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={downloadQuickCreateTemplate}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 active:scale-[0.98]"
                    >
                      <Download className="h-4 w-4" /> Excel şablonunu indir
                    </button>
                    <button
                      type="button"
                      onClick={() => quickCreateFileInputRef.current?.click()}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#172033] active:scale-[0.98]"
                    >
                      <Upload className="h-4 w-4" /> Doldurulmuş dosyayı seç
                    </button>
                    <input
                      ref={quickCreateFileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleQuickCreateFileChange}
                      className="hidden"
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Dosyayı Excel’de doldurup CSV olarak kaydet. Aynı şablonu tekrar içe alabilirsin.
                  </p>
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[#0B1220] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">2. Seçilen dosya</p>
                  <p className="mt-2 rounded-xl bg-white/[0.03] px-3 py-3 text-sm font-semibold text-white">
                    {quickCreateFileName || 'Henüz bir dosya seçilmedi'}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">
                    Beklenen kolonlar: Kart adı, Birim, Alış fiyatı, Minimum stok, Mevcut stok
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Önizleme</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{quickCreateRows.length}</p>
                  <p className="mt-1 text-sm text-slate-400">Satır algılandı</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
                      <p className="text-xs text-emerald-200/80">Geçerli</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-100">{quickCreateAnalysis.validCount}</p>
                    </div>
                    <div className="rounded-xl bg-rose-500/10 px-3 py-2">
                      <p className="text-xs text-rose-200/80">Hatalı</p>
                      <p className="mt-1 text-lg font-semibold text-rose-100">{quickCreateAnalysis.invalidCount}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">İlk satırlar</p>
                  <div className="mt-3 space-y-2">
                    {quickCreatePreview.length === 0 ? (
                      <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-slate-500">Yapıştırınca burada örnek liste görünecek.</p>
                    ) : (
                      quickCreatePreview.map((row) => (
                        <div key={`${row.name}-${row.meta}`} className="rounded-xl bg-white/[0.03] px-3 py-3">
                          <p className="font-semibold text-white">{row.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{row.meta}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {quickCreateAnalysis.issues.length > 0 ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">Hatalı satırlar</p>
                    <div className="mt-3 space-y-2">
                      {quickCreateAnalysis.issues.slice(0, 5).map((issue) => (
                        <div key={`${issue.rowNumber}-${issue.message}`} className="rounded-xl bg-white/[0.03] px-3 py-3">
                          <p className="font-semibold text-white">Satır {issue.rowNumber}</p>
                          <p className="mt-1 text-xs text-rose-200">{issue.message}</p>
                          <p className="mt-1 text-xs text-slate-500">{issue.cells.join(' | ')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={applyQuickCreate}
                  disabled={quickCreateRows.length === 0 || quickCreateAnalysis.invalidCount > 0}
                  className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white shadow-[0_0_24px_rgba(16,185,129,0.22)] transition hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  Hammaddeleri içe aktar
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-3 shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            {productWindows.map((item) => {
              const Icon = item.icon;
              const selected = activeWindow === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => changeActiveWindow(item.id)}
                  className={`relative z-10 w-full cursor-pointer rounded-2xl border p-4 text-left transition duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${selected ? 'border-blue-400/50 bg-blue-600 text-white shadow-[0_0_30px_rgba(59,130,246,0.22)]' : 'border-white/10 bg-[#0B1220] text-slate-300 hover:bg-[#172033] hover:text-white'}`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-white/15 text-white' : 'bg-white/8 text-slate-400'}`}><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{item.label}</span>
                      <span className={`mt-1 block text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>{item.description}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {activeWindow === 'quick' ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-[#101B30] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(2,6,23,0.28)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Hızlı işlemler</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Liste bazlı hızlı ürün ve fiyat yönetimi</h3>
                <p className="mt-1 text-xs text-slate-400">Ürünleri burada aç, fiyatları altta tek seferde kaydet.</p>
              </div>
              <div className="flex rounded-2xl border border-white/10 bg-[#0B1220] p-1">
                <button
                  type="button"
                  onClick={() => setQuickListMode('add')}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${quickListMode === 'add' ? 'bg-blue-600 text-white shadow-[0_0_24px_rgba(59,130,246,0.18)]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                  Hızlı ürün ekleme
                </button>
                <button
                  type="button"
                  onClick={() => setQuickListMode('price')}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${quickListMode === 'price' ? 'bg-emerald-600 text-white shadow-[0_0_24px_rgba(16,185,129,0.18)]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                  Fiyat listesi
                </button>
              </div>
            </div>

            <div className="mt-4">
              {quickListMode === 'add' ? (
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                  <p className="text-sm font-semibold text-white">Hızlı ürün ekleme (liste)</p>
                  <p className="mt-1 text-xs text-slate-400">Satırdan kart aç, detayları sağ panelde tamamla.</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_120px_auto]">
                    <input
                      value={quickSaleDraft.name}
                      onChange={(event) => setQuickSaleDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ürün adı"
                      className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                    />
                    <select
                      value={quickSaleDraft.category}
                      onChange={(event) => setQuickSaleDraft((current) => ({ ...current, category: event.target.value }))}
                      className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                    >
                      {categories.map((category) => (
                        <option key={`quick-add-${category}`} value={category}>{category}</option>
                      ))}
                    </select>
                    <select
                      value={quickSaleDraft.salesUnit}
                      onChange={(event) => setQuickSaleDraft((current) => ({ ...current, salesUnit: event.target.value as SaleUnitType }))}
                      className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                    >
                      <option value="portion">Porsiyon</option>
                      <option value="kg">Kg</option>
                      <option value="bottle">Şişe</option>
                      <option value="glass">Kadeh</option>
                    </select>
                    <input
                      value={quickSaleDraft.salePrice}
                      onChange={(event) => setQuickSaleDraft((current) => ({ ...current, salePrice: event.target.value }))}
                      placeholder="Fiyat"
                      className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveQuickSaleItem}
                      disabled={!quickSaleDraft.name.trim()}
                      className="h-10 rounded-xl border border-blue-300/30 bg-blue-500/20 px-3 text-sm font-semibold text-white transition hover:bg-blue-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Listeye ekle
                    </button>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Çoğalt</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                      <select
                        value={quickDuplicateSourceId}
                        onChange={(event) => setQuickDuplicateSourceId(event.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                      >
                        {saleProducts.map((product) => (
                          <option key={`dup-${product.id}`} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                      <select
                        value={quickDuplicateMode}
                        onChange={(event) => setQuickDuplicateMode(event.target.value as 'full' | 'price-only')}
                        className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                      >
                        <option value="full">Tam kopya</option>
                        <option value="price-only">Sadece fiyat</option>
                      </select>
                      <button
                        type="button"
                        onClick={duplicateQuickSaleItem}
                        disabled={!quickDuplicateSourceId}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/15 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Copy className="h-4 w-4" /> Ürünü çoğalt
                      </button>
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={quickDuplicateWithRecipe}
                        onChange={(event) => setQuickDuplicateWithRecipe(event.target.checked)}
                        disabled={quickDuplicateMode === 'price-only'}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                      Reçeteyi de kopyala
                    </label>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Hızlı fiyat değiştirme (liste)</p>
                      <p className="mt-1 text-xs text-slate-400">Fiyatları satır satır düzenle, alttan tek seferde kaydet.</p>
                    </div>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#111827] px-3 sm:w-72">
                      <Search className="h-4 w-4 text-slate-500" />
                      <input
                        value={quickPriceSearch}
                        onChange={(event) => setQuickPriceSearch(event.target.value)}
                        placeholder="Fiyat listesinde ara"
                        className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                    {quickPriceProducts.length === 0 ? (
                      <p className="rounded-xl border border-white/10 bg-[#111827] px-3 py-3 text-xs text-slate-400">Fiyat güncellenecek ürün bulunamadı.</p>
                    ) : null}
                    {quickPriceProducts.map((product) => {
                      const currentPrice = product.salePrice1 || product.salePrice;
                      const draftValue = quickPriceDrafts[product.id] ?? currentPrice;
                      return (
                        <div key={`quick-price-${product.id}`} className="grid gap-2 rounded-xl border border-white/10 bg-[#111827] p-3 md:grid-cols-[minmax(0,1fr)_110px_120px] md:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                            <p className="mt-1 text-[11px] text-slate-500">Mevcut: {formatTRY(parseAmount(currentPrice))}</p>
                          </div>
                          <input
                            value={draftValue}
                            onChange={(event) =>
                              setQuickPriceDrafts((current) => ({
                                ...current,
                                [product.id]: event.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
                          />
                          <p className="text-xs text-slate-400">Yeni: {formatTRY(parseAmount(draftValue))}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400">Değişen ürün sayısı: <span className="font-semibold text-white">{quickPriceChangedCount}</span></p>
                    <button
                      type="button"
                      onClick={saveQuickPriceBatch}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
                    >
                      Toplu fiyatları kaydet
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeWindow === 'raw' ? (
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Hammadde stoku</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Merkez Şube üretim hammaddeleri</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Burada sadece hammaddeler görünür. Yeni hammadde oluşturduğunda bu listeye gelir ve reçetelerde seçilebilir.</p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">Üretim deposu</span>
              </div>
              <div className="mt-5">
                <input
                  value={rawSearch}
                  onChange={(event) => setRawSearch(event.target.value)}
                  placeholder="Hammadde ara..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[1.15fr_0.72fr_0.72fr_0.8fr_0.7fr_0.65fr] bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><span>Hammadde</span><span>Alış fiyatı</span><span>Satış sonrası</span><span>Fatura sonrası</span><span>Minimum</span><span>Durum</span></div>
                <div className="divide-y divide-white/10">
                  {filteredRawInventoryRows.map((row) => {
                    const state = stockStateLabel(row.invoiceQuantity, row.minimumQuantity);
                    const critical = state === 'Kritik';
                    const selected = selectedRawRow.id === row.id;
                    return <button key={row.id} type="button" onClick={() => setSelectedRawId(row.id)} className={`grid w-full grid-cols-[1.15fr_0.72fr_0.72fr_0.8fr_0.7fr_0.65fr] items-center gap-3 px-4 py-3 text-left text-sm transition ${selected ? 'bg-sky-500/10 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]' : 'bg-[#111827] hover:bg-[#172033]'}`}><div><p className="font-semibold text-white">{row.name}</p><p className="mt-1 text-xs text-slate-500">Ortalama maliyet {formatTRY(row.averageCost)}</p></div><span className="font-semibold text-slate-200">{formatTRY(row.averageCost)}</span><span className="font-semibold text-slate-200">{formatQuantity(row.saleQuantity, row.unit)}</span><span className="font-semibold text-blue-200">{formatQuantity(row.invoiceQuantity, row.unit)}</span><span className="text-slate-400">{formatQuantity(row.minimumQuantity, row.unit)}</span><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${critical ? 'bg-rose-500/15 text-rose-200' : state === 'Takip' ? 'bg-amber-500/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{state}</span></button>;
                  })}
                </div>
              </div>
            </article>

            <aside className="space-y-6">
              <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Stok kartı detayı</p>
                {selectedRawRow ? (
                  <>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-white">{selectedRawRow.name}</h2>
                        <p className="mt-1 text-sm text-slate-400">Anlık stok {formatQuantity(selectedRawRow.invoiceQuantity, selectedRawRow.unit)} • Alış fiyatı {formatTRY(selectedRawRow.averageCost)} • Minimum {formatQuantity(selectedRawRow.minimumQuantity, selectedRawRow.unit)}</p>
                      </div>
                      <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">{selectedRawRow.unit.toUpperCase()}</span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mevcut stok</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{formatQuantity(selectedRawRow.invoiceQuantity, selectedRawRow.unit)}</p>
                        <p className="mt-1 text-sm text-slate-400">Şu an depodaki miktar</p>
                      </div>
                      <div className="rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Yıl içi alım</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{formatQuantity(selectedRawSummary?.yearlyPurchaseQuantity ?? 0, selectedRawRow.unit)}</p>
                        <p className="mt-1 text-sm text-slate-400">Bu yıl toplam alınan miktar</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Mal sayımı</p>
                          <p className="mt-1 text-sm text-slate-400">Sayım sonucunu girip anlık hammadde stokunu güncelle.</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-300">
                          Son sayım {formatCountTimestamp(selectedRawRow.lastCountedAt)}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Kayıtlı stok</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatQuantity(selectedRawRow.invoiceQuantity, selectedRawRow.unit)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sayım farkı</p>
                          <p className={`mt-2 text-lg font-semibold ${rawCountDifference > 0 ? 'text-emerald-200' : rawCountDifference < 0 ? 'text-rose-200' : 'text-white'}`}>
                            {rawCountDifference > 0 ? '+' : ''}{formatQuantity(Math.abs(rawCountDifference), selectedRawRow.unit)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Minimum stok</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatQuantity(selectedRawRow.minimumQuantity, selectedRawRow.unit)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <label className="block">
                          <span className="text-sm text-slate-400">Sayım sonucu ({selectedRawRow.unit})</span>
                          <input value={rawCountInput} onChange={(event) => setRawCountInput(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none" />
                        </label>
                        <div className="flex items-end">
                          <button type="button" onClick={applyRawStockCount} className="h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]">Sayımı uygula</button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Son alış</p>
                      {selectedRawSummary?.latest ? (
                        <div className="mt-3 space-y-2 text-sm text-slate-300">
                          <div className="flex items-center justify-between gap-3"><span>Tedarikçi</span><span className="font-semibold text-white">{selectedRawSummary.latest.supplierName}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Fatura</span><span className="font-semibold text-white">{selectedRawSummary.latest.invoiceNo}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Tarih</span><span className="font-semibold text-white">{selectedRawSummary.latest.date}</span></div>
                          <div className="flex items-center justify-between gap-3"><span>Fiyat</span><span className="font-semibold text-emerald-200">{formatTRY(selectedRawSummary.latest.unitPrice)}</span></div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">Henüz alış geçmişi yok.</p>
                      )}
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Kullanım hızı</p>
                          <p className="mt-1 text-sm text-slate-400">Son 30 gün tüketimi ve stok dayanımı</p>
                        </div>
                        {selectedRawUsageSummary ? (
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedRawUsageSummary.warningTone}`}>
                            {selectedRawUsageSummary.warningLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">30 gün tüketim</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {formatQuantity(selectedRawUsageSummary?.last30DaysUsage ?? 0, selectedRawRow.unit)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Günlük ortalama</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {formatQuantity(selectedRawUsageSummary?.avgDailyUsage ?? 0, selectedRawRow.unit)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Kaç gün yeter</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {selectedRawUsageSummary ? `${Math.floor(selectedRawUsageSummary.daysCover)} gün` : '0 gün'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Fiyat farkı</p>
                          <p className="mt-1 text-sm text-slate-400">Faturalardaki alış fiyatı değişimi</p>
                        </div>
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">Fark {formatTRY(selectedRawSummary?.priceVariance ?? 0)}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">En düşük</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedRawSummary?.lowestPrice ?? 0)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">En yüksek</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedRawSummary?.highestPrice ?? 0)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Ort. maliyet</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedRawRow.averageCost)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Fiyat trendi</p>
                          <p className="mt-1 text-sm text-slate-400">Son alışlara göre kısa görünüm</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">{selectedRawHistory.length} kayıt</span>
                      </div>
                      <div className="mt-4 flex items-end gap-2">
                        {selectedRawHistory.slice(0, 5).reverse().map((movement, index) => {
                          const maxPrice = selectedRawSummary?.highestPrice || 1;
                          const ratio = Math.max(24, (movement.unitPrice / maxPrice) * 72);
                          return (
                            <div key={`${movement.invoiceNo}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                              <div
                                className="w-full rounded-t-xl bg-gradient-to-t from-sky-500/25 to-sky-300/70"
                                style={{ height: `${ratio}px` }}
                              />
                              <div className="text-center">
                                <p className="text-[11px] font-semibold text-white">{formatTRY(movement.unitPrice)}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{movement.date.slice(5)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tedarikçi karşılaştırması</p>
                      <div className="mt-3 space-y-2">
                        {selectedRawSupplierSummary.map((supplier) => (
                          <div key={supplier.supplierName} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-white">{supplier.supplierName}</p>
                              <span className="text-xs font-semibold text-emerald-200">
                                {formatQuantity(supplier.totalQuantity, selectedRawRow.unit)}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                              <span>{supplier.latestInvoiceNo}</span>
                              <span>{formatTRY(supplier.latestUnitPrice)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Stok hareketleri</p>
                      <div className="mt-3 space-y-2">
                        {selectedRawStockTimeline.map((movement) => (
                          <div key={`${movement.type}-${movement.label}-${movement.date}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
                            <div>
                              <p className="font-semibold text-white">{movement.type}</p>
                              <p className="mt-1 text-xs text-slate-400">{movement.label} • {movement.date}</p>
                            </div>
                            <span className={`font-semibold ${movement.direction === 'in' ? 'text-emerald-200' : 'text-amber-200'}`}>
                              {movement.direction === 'in' ? '+' : '-'}
                              {formatQuantity(movement.quantity, selectedRawRow.unit)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[#0B1220]/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Alış geçmişi</p>
                      <div className="mt-3 space-y-2">
                        {selectedRawHistory.map((movement) => (
                          <div key={`${movement.invoiceNo}-${movement.date}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
                            <div>
                              <p className="font-semibold text-white">{movement.invoiceNo}</p>
                              <p className="mt-1 text-xs text-slate-400">{movement.supplierName} • {movement.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-white">{formatQuantity(movement.quantity, selectedRawRow.unit)}</p>
                              <p className="mt-1 text-xs text-emerald-200">{formatTRY(movement.unitPrice)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </article>
            </aside>
          </section>
        ) : null}

        {activeWindow === 'sale' ? (
          <section className="grid gap-6 xl:grid-cols-[0.62fr_1.38fr]">
            <article className="rounded-[1.75rem] border border-blue-400/20 bg-[#101B30] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(2,6,23,0.28)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Satış ürünleri</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Ürün listesi</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">POS ve menü kartları reçete havuzundan gelir. Buradan seç, sağ panelde satış ayarlarını düzenle.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-[#0B1220] px-3 py-1 text-xs font-semibold text-slate-200">
                  {filteredSaleProducts.length}/{saleProducts.length}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Yeni satış ürünü ekleme</p>
                    <p className="mt-1 text-xs leading-5 text-violet-100/75">Hızlı kart oluşturabilir veya reçete havuzundan ürün çekebilirsin.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetNewItemDraft('sale');
                        setShowNewItemForm(true);
                      }}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-300/30 bg-blue-500/20 px-4 text-sm font-semibold text-white transition hover:bg-blue-500/30 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" /> Satış ürünü ekle
                    </button>
                    <button type="button" onClick={() => changeActiveWindow('recipe')} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 active:scale-[0.98]">
                      <Layers3 className="h-4 w-4" /> Reçete havuzuna git
                    </button>
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-white">Satış özeti</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Toplam</p>
                    <p className="mt-2 text-lg font-semibold text-white">{saleProducts.length}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">Reçetesiz</p>
                    <p className="mt-2 text-lg font-semibold text-amber-100">{productsWithoutRecipes.length}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Direkt stok</p>
                    <p className="mt-2 text-lg font-semibold text-emerald-100">{saleProducts.filter((product) => product.stockProcurementType === 'direct').length}</p>
                  </div>
                </div>

                {productsWithoutRecipes.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      {productsWithoutRecipes.length} ürünün reçetesi eksik
                    </div>
                    <p className="mt-1 text-xs text-amber-100/80">Reçetesiz ürünler stok doğruluğunu bozar. Şablon veya kopyalama ile hızlıca tamamlayabilirsin.</p>
                  </div>
                ) : null}
              </details>

              <label className="mt-4 block">
                <span className="text-sm text-slate-400">Ürün ara</span>
                <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1220] px-4">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    value={saleProductSearch}
                    onChange={(event) => setSaleProductSearch(event.target.value)}
                    placeholder="Ad, kategori veya satış tipi"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                  />
                </div>
              </label>

              <details className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-white">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                    <Printer className="h-4 w-4" />
                  </span>
                  Kategori yazıcı yönlendirme
                </summary>
                <p className="mt-3 text-xs leading-5 text-cyan-100/75">Kategoriye göre POS yazıcı rotasını buradan düzenle. Günlük ürün seçimi sırasında ekranı kalabalıklaştırmaması için kapalı gelir.</p>
                <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {categoryPrinterRows.map(({ category, mapping }) => (
                    <div key={category} className="grid gap-2 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-3 md:grid-cols-[1fr_1.2fr_1.2fr] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-white">{category}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Sipariş yazıcısı</p>
                      </div>
                      <select
                        value={mapping?.printer ?? ''}
                        onChange={(event) => updateCategoryPrinterMapping(category, { printer: event.target.value })}
                        className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                      >
                        <option value="">Ana yazıcı seç</option>
                        {printerOptions.map((printerName) => (
                          <option key={`${category}-primary-${printerName}`} value={printerName}>{printerName}</option>
                        ))}
                      </select>
                      <select
                        value={mapping?.fallback ?? ''}
                        onChange={(event) => updateCategoryPrinterMapping(category, { fallback: event.target.value })}
                        className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                      >
                        <option value="">Yedek yazıcı seç</option>
                        {printerOptions.map((printerName) => (
                          <option key={`${category}-fallback-${printerName}`} value={printerName}>{printerName}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {printerOptions.length === 0 ? (
                    <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Henüz POS yazıcısı yok. Önce Ayarlar &gt; Entegrasyonlar ekranından USB veya IP yazıcı ekleyelim.</p>
                  ) : null}
                </div>
              </details>
              <div className="mt-5 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
                {filteredSaleProducts.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-[#0B1220]/70 px-4 py-4 text-sm text-slate-400">Aramaya uygun satış ürünü bulunamadı.</p>
                ) : null}
                {filteredSaleProducts.map((product) => {
                  const productRecipeLines = getProductEffectiveRecipeLines(product, recipeVersions);
                  const productRecipe = recipePool.find((recipe) => recipe.id === product.recipeId);
                  return (
                  <button key={product.id} type="button" onClick={() => setSelectedProductId(product.id)} className={`w-full rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${selectedProductId === product.id ? 'border-blue-400/50 bg-blue-500/15 shadow-[0_0_0_1px_rgba(96,165,250,0.18)]' : 'border-white/10 bg-[#0B1220]/70 hover:border-white/20 hover:bg-[#111827]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">{product.category} • {formatSaleUnitLabel(product.salesUnit)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${product.stockProcurementType === 'direct' ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-500/15 text-slate-200'}`}>
                            {product.stockProcurementType === 'direct' ? 'Direkt depo' : 'Reçete'}
                          </span>
                          {product.stockProcurementType === 'direct' && product.barStockMode === 'bottle-glass' ? (
                            <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                              Şişe/kadeh
                            </span>
                          ) : null}
                          {productRecipe ? (
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${product.recipeOverride ? 'bg-amber-500/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'}`}>
                              {product.recipeOverride ? 'Override' : 'Bağlı'}
                            </span>
                          ) : null}
                          {productRecipeLines.length === 0 ? (
                            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200">Reçete yok</span>
                          ) : (
                            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-200">{productRecipeLines.length} kalem</span>
                          )}
                          {product.fixedMenu ? (
                            <span className="rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-200">Fix menü</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-white">{formatTRY(Number((product.salePrice1 || product.salePrice).replace(',', '.')) || 0)}</p>
                        <p className="mt-1 text-xs text-blue-200">{product.salesCount} satış</p>
                        <p className="mt-1 text-[11px] text-slate-500">{formatProductStockQuantity(product, getDirectProductWarehouseQuantity(product))}</p>
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
              {selectedProduct ? (
                <>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Ürün kartı ve reçete</p><h2 className="mt-2 text-2xl font-semibold text-white">{selectedProduct.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">Satış ürünü bilgileri ile reçete yönetimi tek yerde. Reçete kalemleri sadece hammadde stokundan seçilir.</p></div><button type="button" onClick={() => setSavedNotes((current) => [`${selectedProduct.name} kartı güncellendi.`, ...current])} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]"><Save className="h-4 w-4" /> Kaydet</button></div>

                  <div className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_220px_minmax(0,1fr)_220px]">
                      <label className="block"><span className="text-sm text-slate-400">Ürün adı</span><input value={selectedProduct.name} onChange={(event) => updateSelectedProduct({ name: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                      <label className="block"><span className="text-sm text-slate-400">Kategori</span><select value={selectedProduct.category} onChange={(event) => updateSelectedProduct({ category: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                      <label className="block"><span className="text-sm text-slate-400">Satış tipi</span><select value={selectedProduct.salesUnit} onChange={(event) => {
                        const nextSalesUnit = event.target.value as SaleUnitType;
                        updateSelectedProduct(nextSalesUnit === 'glass'
                          ? { salesUnit: nextSalesUnit, stockProcurementType: 'direct', barStockMode: 'bottle-glass' }
                          : { salesUnit: nextSalesUnit });
                      }} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"><option value="portion">Porsiyon bazlı</option><option value="kg">Kilogram bazlı</option><option value="bottle">Şişe bazlı</option><option value="glass">Kadeh bazlı</option></select></label>
                      <label className="block"><span className="text-sm text-slate-400">Yeni kategori</span><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Yeni kategori adı" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                      <div className="flex items-end"><button type="button" onClick={addCategory} className="h-12 w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 active:scale-[0.98]">Kategori oluştur</button></div>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Yazıcı rotası</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {selectedProduct.category} kategorisi
                            {' '}
                            <span className="font-semibold text-white">{selectedProductPrinterMapping?.printer || 'ana yazıcı seçilmedi'}</span>
                            {' '}
                            yazıcısına gider.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCategoryPrinterMapping(selectedProduct.category, { printer: selectedProductPrinterMapping?.printer ?? printerOptions[0] ?? '' })}
                          className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 active:scale-[0.98]"
                        >
                          Rotayı kaydet
                        </button>
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-4 ${selectedProductMappingValidation.valid ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">POS Mapping</p>
                          <h3 className="mt-1 text-lg font-semibold text-white">Mali POS ürün eşleştirmesi</h3>
                          <p className="mt-1 text-sm text-slate-300">Her satış ürünü POS PLU kodu, KDV ve birim tipi ile doğrulanmadan adisyona eklenemez.</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedProductMappingValidation.valid ? 'bg-emerald-400/15 text-emerald-100' : 'bg-amber-400/15 text-amber-100'}`}>
                          {selectedProductMappingValidation.valid ? 'Eşleşti' : 'Eksik'}
                        </span>
                      </div>

                      {!selectedProductMappingValidation.valid ? (
                        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2">
                          {selectedProductMappingValidation.errors.map((error) => (
                            <p key={error} className="text-xs font-semibold text-amber-100">• {error}</p>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_160px_auto_auto]">
                        <label className="block">
                          <span className="text-sm text-slate-300">POS PLU kodu</span>
                          <input
                            value={mappingDraft.pos_plu_code}
                            onChange={(event) => setMappingDraft((current) => ({ ...current, pos_plu_code: event.target.value }))}
                            placeholder="Örn: PLU1001"
                            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm text-slate-300">KDV</span>
                          <select
                            value={mappingDraft.vat_rate}
                            onChange={(event) => setMappingDraft((current) => ({ ...current, vat_rate: event.target.value }))}
                            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                          >
                            <option value="1">%1</option>
                            <option value="10">%10</option>
                            <option value="20">%20</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm text-slate-300">Birim</span>
                          <select
                            value={mappingDraft.unit_type}
                            onChange={(event) => setMappingDraft((current) => ({ ...current, unit_type: event.target.value as PosUnitType }))}
                            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                          >
                            <option value="adet">Adet</option>
                            <option value="porsiyon">Porsiyon</option>
                            <option value="kg">Kg</option>
                            <option value="lt">Lt</option>
                            <option value="sise">Şişe</option>
                            <option value="bardak">Bardak</option>
                          </select>
                        </label>
                        <div className="flex items-end">
                          <button type="button" onClick={applyAutoProductMapping} className="h-12 rounded-2xl border border-violet-300/25 bg-violet-500/15 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25 active:scale-[0.98]">
                            Otomatik eşleştir
                          </button>
                        </div>
                        <div className="flex items-end">
                          <button type="button" onClick={() => saveSelectedProductMapping(true)} className="h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]">
                            Mapping kaydet
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <textarea
                          value={bulkMappingDraft}
                          onChange={(event) => setBulkMappingDraft(event.target.value)}
                          placeholder="Toplu eşleştirme: Ürün adı;PLU;KDV;Birim"
                          rows={3}
                          className="w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                        />
                        <div className="flex items-end">
                          <button type="button" onClick={applyBulkMappings} disabled={!bulkMappingDraft.trim()} className="h-12 rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                            Toplu kaydet
                          </button>
                        </div>
                      </div>
                      {mappingMessage ? <p className="mt-3 text-sm font-semibold text-blue-100">{mappingMessage}</p> : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stok tedarik modeli</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label className="block md:col-span-2">
                          <span className="text-sm text-slate-400">Ürün stoku nereden beslenir?</span>
                          <select
                            value={selectedProduct.stockProcurementType}
                            onChange={(event) => updateSelectedProduct({ stockProcurementType: event.target.value as SaleStockProcurementType })}
                            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                          >
                            <option value="recipe">Reçete/hammadde üzerinden</option>
                            <option value="direct">Direkt ürün olarak depoya alınır</option>
                          </select>
                        </label>
                        <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Durum</p>
                          <p className="mt-2 text-sm font-semibold text-white">
                            {selectedProduct.stockProcurementType === 'direct' ? 'Direkt stok' : 'Reçete stoku'}
                          </p>
                        </div>
                      </div>

                      {selectedProduct.stockProcurementType === 'direct' ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="block md:col-span-2">
                              <span className="text-sm text-slate-400">Bar çıkış modeli</span>
                              <select
                                value={selectedProduct.barStockMode}
                                onChange={(event) => updateSelectedProduct({ barStockMode: event.target.value as BarStockMode })}
                                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                              >
                                <option value="none">Normal adet/ürün çıkışı</option>
                                <option value="bottle-glass">Şişeden kadeh çıkışı</option>
                              </select>
                            </label>
                            <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Anlık stok</p>
                              <p className="mt-2 text-sm font-semibold text-white">{formatProductStockQuantity(selectedProduct, getDirectProductWarehouseQuantity(selectedProduct))}</p>
                            </div>
                          </div>

                          {selectedProduct.barStockMode === 'bottle-glass' ? (
                            <>
                              <div className="grid gap-3 md:grid-cols-3">
                                <label className="block">
                                  <span className="text-sm text-slate-400">Şişe hacmi (cl)</span>
                                  <input
                                    value={selectedProduct.bottleVolumeCl}
                                    onChange={(event) => updateSelectedProduct({ bottleVolumeCl: event.target.value })}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-sm text-slate-400">Porsiyon hacmi (cl)</span>
                                  <input
                                    value={selectedProduct.portionVolumeCl}
                                    onChange={(event) => updateSelectedProduct({ portionVolumeCl: event.target.value })}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                                  />
                                </label>
                                <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">1 şişe / porsiyon</p>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {getPortionsPerBottle(parseAmount(selectedProduct.bottleVolumeCl || '70'), parseAmount(selectedProduct.portionVolumeCl || '5')).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kadeh
                                  </p>
                                </div>
                              </div>

                              {selectedProductAlcoholControl ? (
                                <div className="grid gap-3 md:grid-cols-4">
                                  <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Açık şişe</p>
                                    <p className="mt-2 text-sm font-semibold text-white">{selectedProductAlcoholControl.openBottleCount}</p>
                                  </div>
                                  <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Beklenen kalan</p>
                                    <p className="mt-2 text-sm font-semibold text-white">{(selectedProductAlcoholControl.variance.expectedRemainingMl / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 })} lt</p>
                                  </div>
                                  <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Gerçek kalan</p>
                                    <p className="mt-2 text-sm font-semibold text-white">{(selectedProductAlcoholControl.variance.actualRemainingMl / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 })} lt</p>
                                  </div>
                                  <div className={`rounded-2xl border px-4 py-3 ${selectedProductAlcoholControl.variance.status === 'critical' ? 'border-rose-400/30 bg-rose-500/10' : selectedProductAlcoholControl.variance.status === 'warning' ? 'border-amber-400/30 bg-amber-500/10' : 'border-emerald-400/30 bg-emerald-500/10'}`}>
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Fark</p>
                                    <p className={`mt-2 text-sm font-semibold ${selectedProductAlcoholControl.variance.status === 'critical' ? 'text-rose-200' : selectedProductAlcoholControl.variance.status === 'warning' ? 'text-amber-200' : 'text-emerald-200'}`}>
                                      {selectedProductAlcoholControl.variance.varianceMl > 0 ? '+' : ''}{(selectedProductAlcoholControl.variance.varianceMl / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 })} lt
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fiyatlandırma</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="block md:col-span-2"><span className="text-sm text-slate-400">Satış fiyatı 1 (varsayılan)</span><input value={selectedProduct.salePrice1} onChange={(event) => updateSelectedProduct({ salePrice1: event.target.value, salePrice: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Fiyat 1 başlangıç</span><input value={selectedProduct.price1Start} onChange={(event) => updateSelectedProduct({ price1Start: formatTimeInput(event.target.value) })} placeholder="09:00" inputMode="numeric" maxLength={5} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Fiyat 1 bitiş</span><input value={selectedProduct.price1End} onChange={(event) => updateSelectedProduct({ price1End: formatTimeInput(event.target.value) })} placeholder="17:00" inputMode="numeric" maxLength={5} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3 md:col-span-2"><span className="text-sm font-semibold text-white">Fiyat 1 saat aralığı aktif</span><input type="checkbox" checked={selectedProduct.price1WindowEnabled} onChange={(event) => updateSelectedProduct({ price1WindowEnabled: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="block md:col-span-2"><span className="text-sm text-slate-400">Satış fiyatı 2 (saat bazlı)</span><input value={selectedProduct.salePrice2} onChange={(event) => updateSelectedProduct({ salePrice2: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Fiyat 2 başlangıç</span><input value={selectedProduct.price2Start} onChange={(event) => updateSelectedProduct({ price2Start: formatTimeInput(event.target.value) })} placeholder="17:00" inputMode="numeric" maxLength={5} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Fiyat 2 bitiş</span><input value={selectedProduct.price2End} onChange={(event) => updateSelectedProduct({ price2End: formatTimeInput(event.target.value) })} placeholder="19:00" inputMode="numeric" maxLength={5} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3 md:col-span-2"><span className="text-sm font-semibold text-white">Fiyat 2 saat aralığı aktif</span><input type="checkbox" checked={selectedProduct.price2WindowEnabled} onChange={(event) => updateSelectedProduct({ price2WindowEnabled: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="block md:col-span-2"><span className="text-sm text-slate-400">Satış fiyatı 3 (event satışı)</span><input value={selectedProduct.salePrice3} onChange={(event) => updateSelectedProduct({ salePrice3: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          {pricingWindowIssues.length > 0 ? (
                            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 md:col-span-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Saat doğrulama</p>
                              <div className="mt-2 space-y-1.5">
                                {pricingWindowIssues.map((issue) => (
                                  <p key={issue} className="text-xs text-amber-100/90">• {issue}</p>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kurallar ve maliyet</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3"><span className="text-sm font-semibold text-white">Ikram yapılabilir</span><input type="checkbox" checked={selectedProduct.allowComplimentary} onChange={(event) => updateSelectedProduct({ allowComplimentary: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3"><span className="text-sm font-semibold text-white">Iskonto yapılabilir</span><input type="checkbox" checked={selectedProduct.allowDiscount} onChange={(event) => updateSelectedProduct({ allowDiscount: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3"><span className="text-sm font-semibold text-white">Fix menü ürünü</span><input type="checkbox" checked={selectedProduct.fixedMenu} onChange={(event) => updateSelectedProduct({ fixedMenu: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3"><span className="text-sm font-semibold text-white">Happy hour'a dahil</span><input type="checkbox" checked={selectedProduct.happyHourEligible} onChange={(event) => updateSelectedProduct({ happyHourEligible: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3"><span className="text-sm font-semibold text-white">Event fiyatına dahil</span><input type="checkbox" checked={selectedProduct.eventPriceEligible} onChange={(event) => updateSelectedProduct({ eventPriceEligible: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-transparent" /></label>
                          <label className="block"><span className="text-sm text-slate-400">KDV</span><select value={selectedProduct.vatRate} onChange={(event) => updateSelectedProduct({ vatRate: Number(event.target.value) as VatRate })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"><option value={1}>%1</option><option value={10}>%10</option><option value={20}>%20</option></select></label>
                          <label className="block"><span className="text-sm text-slate-400">Porsiyon çarpanı</span><input value={selectedProduct.portionMultiplier} onChange={(event) => updateSelectedProduct({ portionMultiplier: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Fire %</span><input value={selectedProduct.wastePercentage} onChange={(event) => updateSelectedProduct({ wastePercentage: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                          <label className="block"><span className="text-sm text-slate-400">Operasyon maliyeti</span><input value={selectedProduct.operationalCost} onChange={(event) => updateSelectedProduct({ operationalCost: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none" /></label>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mal sayımı</p>
                          <p className="mt-1 text-sm text-slate-400">Satışa hazır ürün stokunu burada sayıp kaydet.</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-300">
                          Son sayım {formatCountTimestamp(selectedProduct.lastCountedAt)}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kayıtlı stok</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatProductStockQuantity(selectedProduct, getDirectProductWarehouseQuantity(selectedProduct))}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sayım farkı</p>
                          <p className={`mt-2 text-lg font-semibold ${saleCountDifference > 0 ? 'text-emerald-200' : saleCountDifference < 0 ? 'text-rose-200' : 'text-white'}`}>
                            {saleCountDifference > 0 ? '+' : ''}{formatProductStockQuantity(selectedProduct, Math.abs(saleCountDifference))}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Satış tipi</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatSaleUnitLabel(selectedProduct.salesUnit)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <label className="block">
                          <span className="text-sm text-slate-400">Sayım sonucu ({getSaleStockUnitLabel(selectedProduct.salesUnit)})</span>
                          <input value={saleCountInput} onChange={(event) => setSaleCountInput(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none" />
                        </label>
                        <div className="flex items-end">
                          <button type="button" onClick={applySaleStockCount} className="h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]">Sayımı uygula</button>
                        </div>
                      </div>
                    </div>

                    {selectedProductComplimentarySummary ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">İkram / kayıp raporu</p>
                            <p className="mt-1 text-sm text-slate-400">İkram edilen ürünler stoktan düşer ve sebebe göre kayıp etkisi izlenir.</p>
                          </div>
                          <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100">
                            {selectedProductComplimentarySummary.totalQty.toLocaleString('tr-TR')} adet ikram
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Toplam ikram miktarı</p>
                            <p className="mt-2 text-lg font-semibold text-white">{selectedProductComplimentarySummary.totalQty.toLocaleString('tr-TR')}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Tahmini gelir kaybı</p>
                            <p className="mt-2 text-lg font-semibold text-rose-200">{formatTRY(selectedProductComplimentarySummary.estimatedRevenueLoss)}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {selectedProductComplimentarySummary.reasons.map((item) => (
                            <div key={`${selectedProduct?.id}-${item.reason}`} className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-white">{item.reason}</p>
                                <span className="text-sm font-semibold text-rose-200">{item.qty.toLocaleString('tr-TR')} adet</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">Tahmini kayıp: {formatTRY(item.estimatedRevenueLoss)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#0B1220]/70 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Reçete kalemleri</p>
                        <p className="mt-1 text-xs text-slate-500">Burada sadece ürüne bağlı reçeteyi gör ve küçük düzenleme yap. Havuz yönetimi ayrı ekranda.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">Ürün maliyeti {formatTRY(selectedProductFinance.totalCost)}</span>
                        {selectedRecipe ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedProduct.recipeOverride ? 'bg-amber-500/15 text-amber-200' : 'bg-blue-500/15 text-blue-200'}`}>
                            {selectedProduct.recipeOverride ? `${selectedRecipe.name} + override` : selectedRecipe.name}
                          </span>
                        ) : null}
                        {selectedRecipeVersion ? (
                          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                            Sürüm {selectedRecipeVersion.versionNo}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-[#111827] p-4">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="rounded-2xl border border-white/10 bg-[#0B1220] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bağlı reçete</p>
                          <p className="mt-2 text-sm font-semibold text-white">{selectedRecipe?.name ?? 'Henüz reçete bağlanmadı'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Reçete seçimi ve bağlama işlemini reçete havuzundan yap. Satış ürünleri burada sadece sonucu gösterir.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => changeActiveWindow('recipe')}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Layers3 className="h-4 w-4" /> Reçete havuzundan seç
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]">
                      <div className="relative">
                        <input
                          value={newRecipeIngredientQuery}
                          onChange={(event) => {
                            setNewRecipeIngredientQuery(event.target.value);
                            if (event.target.value.trim().length < 3) {
                              setNewRecipeIngredientId('');
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            const firstResult = recipeIngredientSearchResults[0];
                            if (!firstResult) return;
                            event.preventDefault();
                            setNewRecipeIngredientId(firstResult.id);
                            setNewRecipeIngredientQuery(firstResult.name);
                          }}
                          placeholder="Hammadde ara... en az 3 harf yaz"
                          className="h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none"
                        />
                        {showRecipeIngredientSearchResults ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-white/10 bg-[#0B1220] p-2 shadow-[0_18px_42px_rgba(2,6,23,0.32)]">
                            {recipeIngredientSearchResults.map((ingredient) => (
                              <button
                                key={ingredient.id}
                                type="button"
                                onClick={() => {
                                  setNewRecipeIngredientId(ingredient.id);
                                  setNewRecipeIngredientQuery(ingredient.name);
                                }}
                                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/5"
                              >
                                <span className="font-semibold text-white">{ingredient.name}</span>
                                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{ingredient.unit}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <input value={newRecipeQuantity} onChange={(event) => setNewRecipeQuantity(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none" />
                      <select value={getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? ''} disabled className="h-12 rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-slate-400 outline-none"><option value={getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? ''}>{getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? 'Birim'}</option></select>
                      <button type="button" onClick={addRecipeLine} className="h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]">Hammadde ekle</button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Hammadde maliyeti</p><p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedProductFinance.ingredientCost)}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Fire maliyeti</p><p className="mt-2 text-lg font-semibold text-amber-200">{formatTRY(selectedProductFinance.wasteCost)}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Operasyon</p><p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedProductFinance.operationalCost)}</p></div>
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">Toplam maliyet</p><p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedProductFinance.totalCost)}</p></div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Satış fiyatı 1</p><p className="mt-2 text-lg font-semibold text-white">{formatTRY(selectedProductFinance.salePrice)}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kâr</p><p className={`mt-2 text-lg font-semibold ${selectedProductFinance.profit >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{formatTRY(selectedProductFinance.profit)}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kâr marjı</p><p className={`mt-2 text-lg font-semibold ${selectedProductFinance.profitMargin >= 0 ? 'text-sky-200' : 'text-rose-200'}`}>%{selectedProductFinance.profitMargin.toFixed(1)}</p></div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedProductRecipeLines.length === 0 ? <p className="rounded-2xl bg-[#111827] px-4 py-3 text-sm text-slate-500">Henüz reçete kalemi yok. Reçetesiz ürün satışta stok düşmez.</p> : null}
                      {selectedProductRecipeLines.map((line, index) => {
                        const ingredient = ingredientOptions.find((item) => item.id === line.ingredientId);
                        const unitOptions = getCompatibleUnits(ingredient?.unit ?? 'adet');
                        const lineCost = (() => {
                          const stock = invoiceStocks.find((item) => item.ingredientId === line.ingredientId);
                          const qty = parseAmount(line.quantity);
                          const baseQty = convertToIngredientBaseUnit(qty, line.unit, ingredient?.unit ?? line.unit);
                          const portionMultiplier = Math.max(0, parseAmount(selectedProduct.portionMultiplier || '1')) || 1;
                          return (stock?.averageCost ?? 0) * baseQty * portionMultiplier;
                        })();
                        return <div key={`${selectedProduct.id}-${line.ingredientId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_6rem] items-center gap-3 rounded-2xl bg-[#111827] px-4 py-3"><select value={line.ingredientId} onChange={(event) => updateRecipeLine(index, { ingredientId: event.target.value, unit: getIngredient(event.target.value)?.unit ?? 'adet' })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none">{ingredientOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={line.quantity} onChange={(event) => updateRecipeLine(index, { quantity: event.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none" /><select value={line.unit} onChange={(event) => updateRecipeLine(index, { unit: event.target.value as Ingredient['unit'] })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none">{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select><div className="rounded-xl border border-white/10 bg-[#0B1220] px-3 py-3 text-right text-sm font-semibold text-emerald-200">{formatTRY(lineCost)}</div><button type="button" onClick={() => removeRecipeLine(index)} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 active:scale-[0.98]"><Trash2 className="h-4 w-4" /></button><div className="col-span-5 text-xs text-slate-500">Baz birim: {ingredient?.unit ?? '-'} • Ağırlıklı ortalama maliyet kullanılır</div></div>;
                      })}
                    </div>
                  </div>
                </>
              ) : <p className="text-sm text-slate-400">Önce bir satış ürünü seç.</p>}
            </article>
          </section>
        ) : null}

        {activeWindow === 'bar' ? (
          <section className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <article className="rounded-[1.5rem] border border-sky-400/25 bg-sky-500/10 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-200/80">Toplam satış</p>
                <p className="mt-3 text-2xl font-semibold text-white">{barTotals.totalSales.toLocaleString('tr-TR')} kadeh</p>
                <p className="mt-2 text-xs text-sky-100/70">Canlı adisyon satışından</p>
              </article>
              <article className="rounded-[1.5rem] border border-violet-400/25 bg-violet-500/10 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-violet-200/80">Toplam tüketim</p>
                <p className="mt-3 text-2xl font-semibold text-white">{barTotals.totalConsumptionCl.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cl</p>
                <p className="mt-2 text-xs text-violet-100/70">Porsiyon hacmine göre</p>
              </article>
              <article className={`rounded-[1.5rem] border p-5 ${barTotals.totalVarianceCl < -0.1 ? 'border-rose-400/25 bg-rose-500/10' : barTotals.totalVarianceCl > 0.1 ? 'border-amber-400/25 bg-amber-500/10' : 'border-emerald-400/25 bg-emerald-500/10'}`}>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Varyans</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {barTotals.totalVarianceCl > 0 ? '+' : ''}{barTotals.totalVarianceCl.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cl
                </p>
                <p className="mt-2 text-xs text-slate-300/80">Beklenen ve gerçek stok farkı</p>
              </article>
            </section>

            {barDashboardItems.length === 0 ? (
              <section className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Bar kontrol</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Takip edilen şişe/kadeh ürünü yok</h2>
                <p className="mt-2 text-sm text-slate-400">Satış ürününde kategoriyi "Alkol" yapıp ürünü "Direkt stok" + "Şişeden kadeh çıkışı" olarak ayarladığında bu ekranda görünür.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-4">
                    <p className="text-sm font-semibold text-white">Açılacak şişe</p>
                    <label className="mt-3 block">
                      <span className="text-xs text-slate-500">Açılacak ürün</span>
                      <input value={barActionProductQuery} onChange={(event) => setBarActionProductQuery(event.target.value)} placeholder="Satış ürünlerindeki alkollerden ara" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none" />
                    </label>
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-xl border border-white/10 bg-[#111827] p-2">
                      {barActionSearchResults.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-slate-500">Uygun alkol ürünü yok</p>
                      ) : (
                        barActionSearchResults.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => {
                              setBarActionProductId(product.id);
                              setBarActionProductQuery(product.name);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${barActionProductId === product.id ? 'bg-blue-500/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                          >
                            <span className="font-semibold">{product.name}</span>
                            <span className="text-[11px] text-slate-500">{product.category}</span>
                          </button>
                        ))
                      )}
                    </div>
                    <label className="mt-3 block">
                      <span className="text-xs text-slate-500">Açılacak adet</span>
                      <input value={barOpenBottleCount} onChange={(event) => setBarOpenBottleCount(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none" />
                    </label>
                    <button type="button" onClick={openBarBottle} disabled={!selectedBarActionProduct} className="mt-2 h-10 w-full rounded-xl border border-sky-400/20 bg-sky-500/10 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-60">
                      Ürün için şişe aç
                    </button>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-4">
                    <p className="text-sm font-semibold text-white">Açık şişeler</p>
                    <p className="mt-3 rounded-xl border border-white/10 bg-[#111827] px-3 py-3 text-sm text-slate-500">Henüz açık şişe bulunmuyor.</p>
                  </div>
                </div>
                {barControlMessage ? <p className="mt-3 rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2 text-xs text-slate-300">{barControlMessage}</p> : null}
                <button type="button" onClick={() => changeActiveWindow('sale')} className="mt-4 inline-flex h-11 items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">
                  Satış ürünlerine dön
                </button>
              </section>
            ) : (
              <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Bar ürünleri</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">Açık şişe ve kalan porsiyonlar</h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-300">{barDashboardItems.filter((item) => item.openBottleCount > 0).length} ürün</span>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {barDashboardItems.filter((item) => item.openBottleCount > 0).map((item) => {
                      const leadAlert = item.alerts[0];
                      return (
                        <button
                          key={item.product.id}
                          type="button"
                          onClick={() => setSelectedBarProductId(item.product.id)}
                          className={`rounded-2xl border p-4 text-left transition ${selectedBarProduct?.product.id === item.product.id ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-[#0B1220]/70 hover:bg-[#111827]'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{item.product.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.product.category}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getBarAlertTone(leadAlert.level)}`}>{leadAlert.title}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                            <div className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2">Açık şişe: <span className="font-semibold text-white">{item.openBottleCount}</span></div>
                            <div className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2">Kalan: <span className="font-semibold text-white">{item.remainingPortions.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kadeh</span></div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </article>

                <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Uyarılar</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">Alarm akışı</h3>
                  <div className="mt-3 space-y-2">
                    {barAlerts.length === 0 ? (
                      <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">Kritik alarm yok.</p>
                    ) : (
                      barAlerts.slice(0, 8).map((alert, index) => (
                        <button
                          key={`${alert.productId}-${index}`}
                          type="button"
                          onClick={() => setSelectedBarProductId(alert.productId)}
                          className={`w-full rounded-xl border px-3 py-3 text-left ${getBarAlertTone(alert.level)}`}
                        >
                          <p className="text-sm font-semibold">{alert.title}</p>
                          <p className="mt-1 text-xs">{alert.detail}</p>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              </section>
            )}
          </section>
        ) : null}

        {activeWindow === 'warehouse' ? (
          <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
            <article className="rounded-[1.75rem] border border-amber-400/20 bg-[#13213A] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_38px_rgba(245,158,11,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Depo yapısı</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Ana depo ve departmanlar</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Ürünler içinde departman depolarını oluştur, Ana Depo’dan departmanlara ürün teslim et.</p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Departman ekle</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newDepartmentName}
                    onChange={(event) => setNewDepartmentName(event.target.value)}
                    placeholder="Örn: Bar1, Mutfak, Bar2"
                    className="h-11 flex-1 rounded-xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={addDepartmentWarehouse}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-[#1F2937] transition hover:bg-amber-400 active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" /> Ekle
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {warehouses.map((warehouse) => {
                  const selected = selectedWarehouse.id === warehouse.id;
                  const stockCount = getWarehouseStock(warehouseStocks, warehouse.id).length;
                  return (
                    <button
                      key={warehouse.id}
                      type="button"
                      onClick={() => setSelectedWarehouseId(warehouse.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-amber-300/40 bg-amber-500/10' : 'border-white/10 bg-[#0B1220]/70 hover:bg-[#111827]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">{warehouse.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{warehouse.type === 'main' ? 'Ana Depo' : 'Departman deposu'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">{stockCount} kalem</span>
                          {warehouse.type === 'main' ? <Warehouse className="h-4 w-4 text-amber-200" /> : <Building2 className="h-4 w-4 text-sky-200" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Depo transfer / teslim</p>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-slate-300">Kaynak depo</span>
                      <select
                        value={transferFromWarehouseId}
                        onChange={(event) => {
                          setTransferFromWarehouseId(event.target.value);
                          setTransferIngredientId('');
                          setTransferIngredientSearch('');
                          setTransferQuantity('');
                          setTransferCountInput('');
                        }}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      >
                        {warehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-300">Hedef depo</span>
                      <select
                        value={transferToWarehouseId}
                        onChange={(event) => setTransferToWarehouseId(event.target.value)}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      >
                        <option value="">Hedef depo seç</option>
                        {transferTargetWarehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-slate-300">Ürün ara (en az 3 harf)</span>
                    <input
                      value={transferIngredientSearch}
                      onChange={(event) => {
                        setTransferIngredientSearch(event.target.value);
                        if (event.target.value.trim().length < 3) {
                          setTransferIngredientId('');
                        }
                      }}
                      placeholder="Örn: kah, süt, burg..."
                      className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                    />
                    {transferIngredientSearch.trim().length >= 3 ? (
                      <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-xl border border-white/10 bg-[#0B1220] p-2">
                        {transferSearchResults.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-slate-500">Eşleşen ürün bulunamadı.</p>
                        ) : (
                          transferSearchResults.map((line) => (
                            <button
                              key={`${transferFromWarehouseId}-${line.ingredientId}`}
                              type="button"
                              onClick={() => {
                                setTransferIngredientId(line.ingredientId);
                                setTransferIngredientSearch(line.ingredientName);
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${transferIngredientId === line.ingredientId ? 'bg-emerald-500/20 text-white' : 'text-slate-200 hover:bg-white/5'}`}
                            >
                              <span className="font-semibold">{line.ingredientName}</span>
                              <span className="text-xs text-slate-400">{formatQuantity(line.quantity, line.unit)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Arama sonuçları için en az 3 harf yaz.</p>
                    )}
                  </label>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="block">
                      <span className="text-xs text-slate-300">Teslim miktarı</span>
                      <input
                        value={transferQuantity}
                        onChange={(event) => setTransferQuantity(event.target.value)}
                        placeholder={transferIngredientLine ? `Birim: ${transferIngredientLine.unit}` : 'Miktar'}
                        disabled={transferIsReturnToMain}
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-300">Not</span>
                      <input
                        value={transferNote}
                        onChange={(event) => setTransferNote(event.target.value)}
                        placeholder="Örn: Akşam servisi"
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      />
                    </label>
                  </div>
                  {transferIsReturnToMain ? (
                    <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3">
                      <p className="text-xs font-semibold text-sky-100">Ana depoya geri teslim (sayım)</p>
                      <p className="mt-1 text-xs text-sky-100/80">Adisyon satış tüketimi tahmini: {formatQuantity(estimatedConsumedForTransferLine, transferIngredientLine?.unit ?? 'adet')} • Önerilen kalan: {formatQuantity(suggestedReturnQty, transferIngredientLine?.unit ?? 'adet')}</p>
                      <label className="mt-2 block">
                        <span className="text-xs text-slate-200">Sayım sonucu (kalan ürün)</span>
                        <input
                          value={transferCountInput}
                          onChange={(event) => setTransferCountInput(event.target.value)}
                          placeholder={transferIngredientLine ? `Birim: ${transferIngredientLine.unit}` : 'Sayım miktarı'}
                          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-slate-300">Teslim eden personel</span>
                      <input
                        value={transferDeliveredBy}
                        onChange={(event) => setTransferDeliveredBy(event.target.value)}
                        placeholder="Örn: Ahmet Yılmaz"
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-300">Teslim alan personel</span>
                      <input
                        value={transferReceivedBy}
                        onChange={(event) => setTransferReceivedBy(event.target.value)}
                        placeholder="Örn: Elif Demir"
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={executeWarehouseTransfer}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
                  >
                    <ArrowRightLeft className="h-4 w-4" /> Teslimi kaydet
                  </button>
                  {warehouseTransferError ? <p className="text-xs font-semibold text-rose-200">{warehouseTransferError}</p> : null}
                  {warehouseTransferMessage ? <p className="text-xs font-semibold text-emerald-200">{warehouseTransferMessage}</p> : null}
                </div>
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Seçili depo</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{selectedWarehouse.name}</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-300">
                  {selectedWarehouse.type === 'main' ? 'Ana Depo' : 'Departman'}
                </span>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[1.2fr_0.6fr_0.7fr] bg-[#0B1220] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Ürün</span>
                  <span>Birim</span>
                  <span>Miktar</span>
                </div>
                <div className="divide-y divide-white/10">
                  {selectedWarehouseStock.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500">Bu depoda henüz ürün yok.</p>
                  ) : (
                    selectedWarehouseStock.map((line) => (
                      <div key={`${selectedWarehouse.id}-${line.ingredientId}`} className="grid grid-cols-[1.2fr_0.6fr_0.7fr] items-center gap-3 bg-[#111827] px-4 py-3 text-sm">
                        <p className="font-semibold text-white">{line.ingredientName}</p>
                        <p className="text-slate-400">{line.unit}</p>
                        <p className="font-semibold text-blue-200">{formatQuantity(line.quantity, line.unit)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-[#0B1220]/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Transfer geçmişi</p>
                <div className="mt-3 space-y-2">
                  {warehouseHistory.length === 0 ? (
                    <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm text-slate-500">Bu depo için transfer kaydı yok.</p>
                  ) : (
                    warehouseHistory.slice(0, 8).map((record) => {
                      const outgoing = record.fromWarehouseId === selectedWarehouse.id;
                      return (
                        <div key={record.id} className="rounded-xl bg-white/[0.03] px-3 py-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-white">{record.ingredientName}</p>
                            <p className={`font-semibold ${outgoing ? 'text-rose-200' : 'text-emerald-200'}`}>
                              {outgoing ? '-' : '+'}{formatQuantity(record.quantity, record.unit)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {record.fromWarehouseName} → {record.toWarehouseName} • {formatWarehouseTransferDate(record.transferredAt)}
                          </p>
                          {(record.deliveredBy || record.receivedBy) ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {record.deliveredBy ? `Teslim eden: ${record.deliveredBy}` : 'Teslim eden: -'}
                              {' • '}
                              {record.receivedBy ? `Teslim alan: ${record.receivedBy}` : 'Teslim alan: -'}
                            </p>
                          ) : null}
                          {record.note ? <p className="mt-1 text-xs text-slate-500">Not: {record.note}</p> : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {activeWindow === 'recipe' ? (
          <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
            <article className="rounded-[1.75rem] border border-violet-400/20 bg-[#13213A] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_38px_rgba(139,92,246,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Reçete havuzu</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Merkezi reçeteler</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Hazır reçeteleri burada yönet. Ürün ekranında sadece reçete bağla ve kullan.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  value={selectedRecipeCategory}
                  onChange={(event) => setSelectedRecipeCategory(event.target.value)}
                  className="h-10 rounded-2xl border border-violet-400/20 bg-[#0B1220] px-4 text-sm font-semibold text-white outline-none"
                >
                  {recipeCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={createTemplateFromSelectedProduct}
                  disabled={!selectedProduct}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Layers3 className="h-4 w-4" /> Seçili üründen oluştur
                </button>
                <button
                  type="button"
                  onClick={() => moveRecipeToSaleProducts()}
                  disabled={selectedPoolRecipeIds.length === 0 && !selectedPoolRecipe}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-white transition hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" /> Seçilenleri satış ürünlerine ekle
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {filteredRecipePool.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-[#0B1220]/70 px-4 py-4 text-sm text-slate-400">Henüz reçete havuzu yok. Satış ürününden bir reçete oluşturabilirsin.</p>
                ) : (
                  filteredRecipePool.map((recipe) => {
                    const version = getLatestPublishedRecipeVersion(recipe.id, recipeVersions);
                    const isSelected = selectedPoolRecipeIds.includes(recipe.id);
                    return (
                      <button
                        key={recipe.id}
                        type="button"
                        onClick={() => setSelectedPoolRecipeId(recipe.id)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition active:scale-[0.98] ${selectedPoolRecipe?.id === recipe.id ? 'border-violet-400/40 bg-violet-500/10' : 'border-white/10 bg-[#0B1220]/70 hover:bg-[#111827]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span
                              role="checkbox"
                              aria-checked={isSelected}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPoolRecipeIds((current) =>
                                  current.includes(recipe.id)
                                    ? current.filter((id) => id !== recipe.id)
                                    : [...current, recipe.id],
                                );
                              }}
                              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                isSelected
                                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                                  : 'border-white/10 bg-[#111827] text-transparent hover:border-white/20'
                              }`}
                            >
                              <CheckSquare className="h-3.5 w-3.5" />
                            </span>
                            <div>
                            <p className="font-semibold text-white">{recipe.name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {(recipe.category || inferCategory(recipe.name))} • {version?.ingredients.length ?? 0} kalem • yayınlanan sürüm {version?.versionNo ?? 0}
                            </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200">
                            {saleProducts.filter((product) => product.recipeId === recipe.id).length} ürün bağlı
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </article>

            <article className="rounded-[1.75rem] border border-white/10 bg-[#111827] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_42px_rgba(2,6,23,0.28)]">
              {selectedPoolRecipe ? (
                <>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Reçete detayı</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">{selectedPoolRecipe.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">Burada yaptığın değişiklik, bu reçeteye bağlı tüm ürünleri etkiler.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPoolVersion ? (
                        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                          Sürüm {selectedPoolVersion.versionNo}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={publishPoolDraftVersion}
                        disabled={poolDraftLines.length === 0}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Save className="h-4 w-4" /> Yeni sürüm yayınla
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    <label className="block">
                      <span className="text-sm text-slate-400">Reçete adı</span>
                      <input
                        value={selectedPoolRecipe.name}
                        onChange={(event) => updateSelectedPoolRecipe({ name: event.target.value })}
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-400">Kategori</span>
                      <select
                        value={selectedPoolRecipe.category || inferCategory(selectedPoolRecipe.name)}
                        onChange={(event) => updateSelectedPoolRecipe({ category: event.target.value })}
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none"
                      >
                        {categories.map((category) => (
                          <option key={`recipe-category-${category}`} value={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {selectedProductSuggestions.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedProductSuggestions.map((ingredient) => (
                        <button
                          key={ingredient.id}
                          type="button"
                          onClick={() =>
                            setPoolDraftLines((current) => [
                              ...current,
                              { ingredientId: ingredient.id, qty: '1', unit: ingredient.unit },
                            ])
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
                        >
                          <Sparkles className="h-4 w-4" /> {ingredient.name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]">
                    <div className="relative">
                      <input
                        value={newRecipeIngredientQuery}
                        onChange={(event) => {
                          setNewRecipeIngredientQuery(event.target.value);
                          if (event.target.value.trim().length < 3) {
                            setNewRecipeIngredientId('');
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          const firstResult = recipeIngredientSearchResults[0];
                          if (!firstResult) return;
                          event.preventDefault();
                          setNewRecipeIngredientId(firstResult.id);
                          setNewRecipeIngredientQuery(firstResult.name);
                        }}
                        placeholder="Hammadde ara... en az 3 harf yaz"
                        className="h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none"
                      />
                      {showRecipeIngredientSearchResults ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-white/10 bg-[#0B1220] p-2 shadow-[0_18px_42px_rgba(2,6,23,0.32)]">
                          {recipeIngredientSearchResults.map((ingredient) => (
                            <button
                              key={ingredient.id}
                              type="button"
                              onClick={() => {
                                setNewRecipeIngredientId(ingredient.id);
                                setNewRecipeIngredientQuery(ingredient.name);
                              }}
                              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition hover:bg-white/5"
                            >
                              <span className="font-semibold text-white">{ingredient.name}</span>
                              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{ingredient.unit}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <input value={newRecipeQuantity} onChange={(event) => setNewRecipeQuantity(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-white outline-none" />
                    <select value={getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? ''} disabled className="h-12 rounded-2xl border border-white/10 bg-[#111827] px-4 font-semibold text-slate-400 outline-none"><option value={getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? ''}>{getIngredient(newRecipeIngredientId)?.unit ?? ingredientOptions.find((item) => item.id === newRecipeIngredientId)?.unit ?? 'Birim'}</option></select>
                    <button type="button" onClick={addPoolDraftLine} className="h-12 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]">Hammadde ekle</button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {poolDraftLines.length === 0 ? <p className="rounded-2xl bg-[#111827] px-4 py-3 text-sm text-slate-500">Henüz reçete kalemi yok.</p> : null}
                    {poolDraftLines.map((line, index) => {
                      const ingredient = ingredientOptions.find((item) => item.id === line.ingredientId);
                      const unitOptions = getCompatibleUnits(ingredient?.unit ?? 'adet');
                      return (
                        <div key={`${selectedPoolRecipe.id}-${line.ingredientId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_6rem] items-center gap-3 rounded-2xl bg-[#111827] px-4 py-3">
                          <select value={line.ingredientId} onChange={(event) => updatePoolDraftLine(index, { ingredientId: event.target.value, unit: getIngredient(event.target.value)?.unit ?? 'adet' })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none">{ingredientOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                          <input value={line.qty} onChange={(event) => updatePoolDraftLine(index, { qty: event.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none" />
                          <select value={line.unit} onChange={(event) => updatePoolDraftLine(index, { unit: event.target.value as Ingredient['unit'] })} className="h-11 rounded-xl border border-white/10 bg-[#0B1220] px-3 font-semibold text-white outline-none">{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
                          <button type="button" onClick={() => removePoolDraftLine(index)} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 active:scale-[0.98]"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Önce bir reçete seç.</p>
              )}
            </article>
          </section>
        ) : null}

        {savedNotes.length > 0 ? <section className="space-y-3">{savedNotes.map((note, index) => <p key={`${note}-${index}`} className="rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-200">{note}</p>)}</section> : null}
      </div>
    </AppShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageContent />
    </Suspense>
  );
}

