import {
  isInventoryOnlyProductType,
  isSellableProductType,
  resolveProductDomainType,
  type ProductDomainType,
} from '@/lib/product-domain';

export type ProductOperationDomain =
  | 'sale_products'
  | 'stock_items'
  | 'semi_products'
  | 'combo_products'
  | 'modifier_groups'
  | 'variants';

export type ProductOperationSeverity = 'healthy' | 'warning' | 'critical';

export type ProductOperationRecipeLine = {
  ingredientId: string;
  quantity?: number;
  qty?: string | number;
  unit?: 'kg' | 'gr' | 'lt' | 'ml' | 'adet' | string;
};

export type ProductOperationInput = {
  id: string;
  posKey?: string | null;
  sku?: string | null;
  barcode?: string | null;
  externalId?: string | null;
  legacyKey?: string | null;
  revision?: number | null;
  name: string;
  category?: string | null;
  productType?: ProductDomainType | string | null;
  salePrice?: string | number | null;
  purchasePrice?: string | number | null;
  vatRate?: number | null;
  currentQuantity?: string | number | null;
  minimumQuantity?: string | number | null;
  recipeLines?: ProductOperationRecipeLine[];
  source?: string;
};

export type ProductOperationIssue = {
  code:
    | 'stock_item_in_pos_scope'
    | 'missing_recipe'
    | 'missing_category'
    | 'missing_price'
    | 'negative_cost'
    | 'low_margin'
    | 'missing_printer_route'
    | 'low_stock'
    | 'invalid_product_type';
  severity: Exclude<ProductOperationSeverity, 'healthy'>;
  title: string;
  detail: string;
};

export type ProductOperationCostLine = {
  ingredientId: string;
  quantity: number;
  unit?: string;
  unitCost: number;
  lineCost: number;
};

export type ProductOperationRow = {
  id: string;
  posKey?: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  name: string;
  category: string;
  productType: ProductDomainType;
  domain: ProductOperationDomain;
  salePrice: number;
  cost: number;
  marginPercent: number | null;
  healthScore: number;
  severity: ProductOperationSeverity;
  issues: ProductOperationIssue[];
  recipeLineCount: number;
  costLines: ProductOperationCostLine[];
  posVisible: boolean;
  branchVisibility: Array<{ branchId: string; label: string; enabled: boolean; priceOverride?: number }>;
  version: number;
};

export type ProductOperationsSummary = {
  total: number;
  sellable: number;
  inventoryOnly: number;
  critical: number;
  warnings: number;
  lowMargin: number;
  missingRecipes: number;
  posLeakage: number;
  averageHealth: number;
};

export const PRODUCT_OPERATION_DOMAIN_LABELS: Record<ProductOperationDomain, string> = {
  sale_products: 'Satış Ürünleri',
  stock_items: 'Hammaddeler',
  semi_products: 'Yarı Mamüller',
  combo_products: 'Combo Ürünler',
  modifier_groups: 'Modifier Grupları',
  variants: 'Varyantlar',
};

const DEFAULT_BRANCHES = [
  { branchId: 'mrk', label: 'Merkez' },
  { branchId: 'kdy', label: 'Kadıköy' },
  { branchId: 'izm', label: 'İzmir' },
];

export function parseOperationalNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveProductOperationDomain(productType: ProductDomainType): ProductOperationDomain {
  if (productType === 'stock_item') return 'stock_items';
  if (productType === 'semi_product') return 'semi_products';
  if (productType === 'combo_product') return 'combo_products';
  return 'sale_products';
}

function normalizeQuantity(line: ProductOperationRecipeLine) {
  const base = typeof line.quantity === 'number' ? line.quantity : parseOperationalNumber(line.qty);
  if (line.unit === 'gr' || line.unit === 'ml') return base / 1000;
  return base;
}

export function calculateProductCost(
  recipeLines: ProductOperationRecipeLine[],
  ingredientCosts: Record<string, number>,
) {
  const costLines = recipeLines.map((line) => {
    const quantity = normalizeQuantity(line);
    const unitCost = ingredientCosts[line.ingredientId] ?? 0;
    return {
      ingredientId: line.ingredientId,
      quantity,
      unit: line.unit,
      unitCost,
      lineCost: quantity * unitCost,
    };
  });

  return {
    totalCost: costLines.reduce((sum, line) => sum + line.lineCost, 0),
    costLines,
  };
}

export function buildProductOperationRows(
  products: ProductOperationInput[],
  options: {
    ingredientCosts?: Record<string, number>;
    recipeFallbacks?: Record<string, ProductOperationRecipeLine[]>;
    printerRoutes?: Record<string, string | undefined>;
    nowVersion?: number;
  } = {},
) {
  const ingredientCosts = options.ingredientCosts ?? {};
  const recipeFallbacks = options.recipeFallbacks ?? {};
  const printerRoutes = options.printerRoutes ?? {};
  const version = options.nowVersion ?? 1;

  return products.map((product): ProductOperationRow => {
    const productType = resolveProductDomainType(product);
    const domain = resolveProductOperationDomain(productType);
    const salePrice = parseOperationalNumber(product.salePrice);
    const recipeLines = product.recipeLines?.length ? product.recipeLines : recipeFallbacks[product.name] ?? [];
    const { totalCost, costLines } = calculateProductCost(recipeLines, ingredientCosts);
    const marginPercent = salePrice > 0 ? ((salePrice - totalCost) / salePrice) * 100 : null;
    const issues: ProductOperationIssue[] = [];

    if (!['stock_item', 'sale_product', 'semi_product', 'combo_product'].includes(productType)) {
      issues.push({
        code: 'invalid_product_type',
        severity: 'critical',
        title: 'Geçersiz ürün tipi',
        detail: 'Ürün tipi operasyon domainlerinden biriyle eşleşmiyor.',
      });
    }

    if (isInventoryOnlyProductType(productType) && product.source === 'pos_payload') {
      issues.push({
        code: 'stock_item_in_pos_scope',
        severity: 'critical',
        title: 'POS sızıntısı',
        detail: 'Hammadde veya yarı mamül satış kataloğuna girmeye çalışıyor.',
      });
    }

    if (isSellableProductType(productType)) {
      if (!product.category?.trim()) {
        issues.push({
          code: 'missing_category',
          severity: 'warning',
          title: 'Kategori eksik',
          detail: 'Satış ürünü POS kategori yapısına bağlanmalı.',
        });
      }
      if (salePrice <= 0) {
        issues.push({
          code: 'missing_price',
          severity: 'critical',
          title: 'Satış fiyatı eksik',
          detail: 'Satışa açılacak ürünün geçerli fiyatı olmalı.',
        });
      }
      if (recipeLines.length === 0) {
        issues.push({
          code: 'missing_recipe',
          severity: 'warning',
          title: 'Reçete eksik',
          detail: 'Maliyet, stok düşümü ve mutfak hazırlığı için reçete bağlanmalı.',
        });
      }
      if (!printerRoutes[product.id] && !printerRoutes[product.category ?? '']) {
        issues.push({
          code: 'missing_printer_route',
          severity: 'warning',
          title: 'Yazıcı rotası eksik',
          detail: 'Mutfak/bar fişi için kategori veya ürün bazlı rota tanımlanmalı.',
        });
      }
      if (marginPercent !== null && marginPercent < 35) {
        issues.push({
          code: 'low_margin',
          severity: 'warning',
          title: 'Düşük marj',
          detail: 'Teorik marj %35 altında; fiyat veya reçete kontrol edilmeli.',
        });
      }
    }

    if (totalCost < 0) {
      issues.push({
        code: 'negative_cost',
        severity: 'critical',
        title: 'Negatif maliyet',
        detail: 'Maliyet hesabı negatif çıktı; stok kartı veya dönüşüm oranı bozuk olabilir.',
      });
    }

    if (productType === 'stock_item' || productType === 'semi_product') {
      const current = parseOperationalNumber(product.currentQuantity);
      const minimum = parseOperationalNumber(product.minimumQuantity);
      if (minimum > 0 && current <= minimum) {
        issues.push({
          code: 'low_stock',
          severity: 'warning',
          title: 'Kritik stok',
          detail: 'Mevcut miktar minimum seviyeye yakın veya altında.',
        });
      }
    }

    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
    const healthScore = Math.max(0, 100 - (criticalCount * 35) - (warningCount * 12));
    const severity: ProductOperationSeverity = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

    return {
      id: product.id,
      posKey: product.posKey ?? undefined,
      sku: product.sku ?? undefined,
      barcode: product.barcode ?? undefined,
      externalId: product.externalId ?? undefined,
      legacyKey: product.legacyKey ?? undefined,
      name: product.name,
      category: product.category?.trim() || 'Kategorisiz',
      productType,
      domain,
      salePrice,
      cost: totalCost,
      marginPercent,
      healthScore,
      severity,
      issues,
      recipeLineCount: recipeLines.length,
      costLines,
      posVisible: isSellableProductType(productType),
      branchVisibility: DEFAULT_BRANCHES.map((branch, index) => ({
        ...branch,
        enabled: productType !== 'stock_item' || index === 0,
        priceOverride: salePrice > 0 && index > 0 ? Math.round(salePrice * (1 + (index * 0.04))) : undefined,
      })),
      version: product.revision ?? version,
    };
  });
}

export function summarizeProductOperations(rows: ProductOperationRow[]): ProductOperationsSummary {
  const total = rows.length;
  const critical = rows.filter((row) => row.severity === 'critical').length;
  const warnings = rows.filter((row) => row.severity === 'warning').length;

  return {
    total,
    sellable: rows.filter((row) => row.posVisible).length,
    inventoryOnly: rows.filter((row) => !row.posVisible).length,
    critical,
    warnings,
    lowMargin: rows.filter((row) => row.issues.some((issue) => issue.code === 'low_margin')).length,
    missingRecipes: rows.filter((row) => row.issues.some((issue) => issue.code === 'missing_recipe')).length,
    posLeakage: rows.filter((row) => row.issues.some((issue) => issue.code === 'stock_item_in_pos_scope')).length,
    averageHealth: total === 0 ? 100 : Math.round(rows.reduce((sum, row) => sum + row.healthScore, 0) / total),
  };
}

export function buildRecipeUsageGraph(rows: ProductOperationRow[]) {
  const usage = new Map<string, ProductOperationRow[]>();
  rows.forEach((row) => {
    row.costLines.forEach((line) => {
      const current = usage.get(line.ingredientId) ?? [];
      current.push(row);
      usage.set(line.ingredientId, current);
    });
  });
  return usage;
}

export function simulateProductOperationImpact(row: ProductOperationRow, allRows: ProductOperationRow[]) {
  const usageGraph = buildRecipeUsageGraph(allRows);
  const directDependents = usageGraph.get(row.id) ?? [];
  const branchCount = row.branchVisibility.filter((branch) => branch.enabled).length;
  const cacheTargets = row.posVisible
    ? ['POS katalog', 'QR menü', 'offline satış paketi', 'mutfak yazıcı rotası']
    : ['stok raporu', 'reçete grafiği', 'satın alma ekranı'];

  return {
    affectedRecipes: directDependents.length,
    affectedBranches: branchCount,
    cacheTargets,
    requiresManagerApproval: row.severity === 'critical' || directDependents.length > 5,
    runtimePropagation: row.posVisible ? 'Websocket ürün kataloğu yenileme + offline katalog versiyon artışı' : 'Stok ve reçete bağımlılık grafiği yenileme',
  };
}
