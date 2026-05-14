import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';
import {
  applyRecipeOverrides,
  getDefaultRecipePoolState,
  getLatestPublishedRecipeVersion,
  loadStoredRecipePool,
  suggestRecipeTemplateId,
  type ProductRecipeOverride,
  type RecipePoolIngredientLine,
  type RecipePoolUnit,
} from '@/lib/recipe-pool';
import { loadStoredRawIngredients } from '@/lib/raw-ingredient-store';
import { MAIN_WAREHOUSE_ID, loadAllWarehouseStocks } from '@/lib/warehouse-store';
import { loadStoredPurchaseInvoices } from '@/lib/purchase-invoice-store';
import { branchStocks, erpAccounts, erpIngredients, type BranchId } from '@/lib/erp-engine';

export type SmartStockUnit = 'kg' | 'lt' | 'adet';

export type SmartRecipeIngredient = {
  ingredientId: string;
  qty: string;
  unit: RecipePoolUnit;
  wastageRate?: number;
};

export type SmartRecipeVariation = {
  id: string;
  name: string;
  keywords: string[];
  factor: number;
  overrides?: ProductRecipeOverride[];
};

export type SmartRecipeModifier = {
  id: string;
  name: string;
  keywords: string[];
  ingredientId: string;
  qtyDelta: string;
  unit: RecipePoolUnit;
};

export type SmartRecipeDefinition = {
  id: string;
  productName: string;
  category: string;
  aliases: string[];
  ingredients: SmartRecipeIngredient[];
  variations: SmartRecipeVariation[];
  modifiers: SmartRecipeModifier[];
  defaultWastageRate: number;
};

export type MarketplaceTemplate = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  confidenceHint: 'high' | 'medium';
};

export type AiRecipeDraft = {
  recipe: SmartRecipeDefinition;
  confidence: number;
  explanation: string;
  missingIngredientIds: string[];
};

export type SaleConsumptionLine = {
  id: string;
  name: string;
  qty: number;
  note?: string;
};

export type IngredientConsumption = {
  ingredientId: string;
  stockUnit: SmartStockUnit;
  netQty: number;
  wastageQty: number;
};

export type StockDeductionResult = {
  branchId: BranchId;
  consumed: IngredientConsumption[];
  unmatchedProducts: string[];
  updatedTheoreticalStock: Record<string, number>;
};

export type TheoreticalVariance = {
  ingredientId: string;
  theoreticalQty: number;
  actualQty: number;
  varianceQty: number;
  varianceRate: number;
  unit: SmartStockUnit;
};

export type LowStockPrediction = {
  ingredientId: string;
  currentQty: number;
  minimumQty: number;
  avgDailyUsage: number;
  daysLeft: number;
  predictedRunOutDate: string | null;
  unit: SmartStockUnit;
};

export type SupplierSuggestion = {
  ingredientId: string;
  supplierName: string;
  confidence: number;
  reason: string;
};

type ConsumptionHistoryEntry = {
  date: string;
  branchId: BranchId;
  ingredientId: string;
  qty: number;
  type: 'sale' | 'wastage';
};

type WastageEvent = {
  id: string;
  date: string;
  branchId: BranchId;
  ingredientId: string;
  qty: number;
  reason: string;
};

type SmartEngineState = {
  theoreticalStockByBranch: Record<string, Record<string, number>>;
  consumptionHistory: ConsumptionHistoryEntry[];
  wastageEvents: WastageEvent[];
};

const STORAGE_KEY = 'adisyon-smart-recipe-stock-engine';

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseQty(value: string) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStockUnit(unit: RecipePoolUnit): SmartStockUnit {
  if (unit === 'gr' || unit === 'kg') return 'kg';
  if (unit === 'ml' || unit === 'lt') return 'lt';
  return 'adet';
}

function convertQtyToStockUnit(quantity: number, from: RecipePoolUnit, stockUnit: SmartStockUnit) {
  if (stockUnit === 'kg') {
    if (from === 'kg') return quantity;
    if (from === 'gr') return quantity / 1000;
    return 0;
  }
  if (stockUnit === 'lt') {
    if (from === 'lt') return quantity;
    if (from === 'ml') return quantity / 1000;
    return 0;
  }
  if (from === 'adet') return quantity;
  return 0;
}

function inferDefaultWastageRate(category: string) {
  const normalized = normalizeText(category);
  if (normalized.includes('izgara') || normalized.includes('kebap') || normalized.includes('et')) return 0.08;
  if (normalized.includes('salata') || normalized.includes('kahvalti')) return 0.06;
  if (normalized.includes('kahve') || normalized.includes('icecek')) return 0.03;
  if (normalized.includes('tatli')) return 0.04;
  return 0.05;
}

function getDefaultState(): SmartEngineState {
  return {
    theoreticalStockByBranch: {},
    consumptionHistory: [],
    wastageEvents: [],
  };
}

export function loadSmartRecipeStockState(): SmartEngineState {
  if (typeof window === 'undefined') return getDefaultState();
  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as SmartEngineState;
    if (!parsed || typeof parsed !== 'object') return getDefaultState();
    return {
      theoreticalStockByBranch: parsed.theoreticalStockByBranch ?? {},
      consumptionHistory: Array.isArray(parsed.consumptionHistory) ? parsed.consumptionHistory : [],
      wastageEvents: Array.isArray(parsed.wastageEvents) ? parsed.wastageEvents : [],
    };
  } catch {
    return getDefaultState();
  }
}

export function saveSmartRecipeStockState(state: SmartEngineState) {
  if (typeof window === 'undefined') return;
  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(state));
}

function resolveBranchStockUnit(ingredientId: string): SmartStockUnit {
  const ingredient = erpIngredients.find((item) => item.id === ingredientId);
  if (!ingredient) return 'adet';
  if (ingredient.unit === 'kg' || ingredient.unit === 'gr') return 'kg';
  if (ingredient.unit === 'lt' || ingredient.unit === 'ml') return 'lt';
  return 'adet';
}

function getTheoreticalStockSnapshot(branchId: BranchId) {
  const state = loadSmartRecipeStockState();
  const current = state.theoreticalStockByBranch[branchId];
  if (current) return current;

  const seeded = Object.fromEntries(
    branchStocks
      .filter((line) => line.branchId === branchId)
      .map((line) => [line.ingredientId, line.quantity]),
  ) as Record<string, number>;

  state.theoreticalStockByBranch[branchId] = seeded;
  saveSmartRecipeStockState(state);
  return seeded;
}

function upsertRecipeFromPool(productName: string, categoryHint = ''): SmartRecipeDefinition | null {
  const pool = loadStoredRecipePool() ?? getDefaultRecipePoolState();
  const templateId = suggestRecipeTemplateId(productName, categoryHint);
  if (!templateId) return null;

  const recipe = pool.recipes.find((item) => item.id === templateId);
  const version = getLatestPublishedRecipeVersion(recipe?.id, pool.versions);
  if (!recipe || !version) return null;

  return {
    id: `smart-${recipe.id}`,
    productName,
    category: recipe.category,
    aliases: [productName],
    ingredients: version.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      qty: line.qty,
      unit: line.unit,
    })),
    variations: [
      { id: 'portion-half', name: 'Yarım', keywords: ['yarim', 'yarım', 'half'], factor: 0.5 },
      { id: 'portion-double', name: 'Duble', keywords: ['duble', 'double', 'cift', 'çift'], factor: 2 },
    ],
    modifiers: [],
    defaultWastageRate: inferDefaultWastageRate(recipe.category),
  };
}

function inferRecipeByTurkishPatterns(productName: string, categoryHint = ''): SmartRecipeDefinition {
  const normalized = normalizeText(`${productName} ${categoryHint}`);

  const fallbackByGroup: SmartRecipeIngredient[] = normalized.includes('kahve') || normalized.includes('latte')
    ? [
        { ingredientId: 'coffee-bean', qty: '10', unit: 'gr' },
        { ingredientId: 'water', qty: '120', unit: 'ml' },
      ]
    : normalized.includes('kebap') || normalized.includes('durum') || normalized.includes('döner') || normalized.includes('doner')
      ? [
          { ingredientId: 'meat', qty: '180', unit: 'gr' },
          { ingredientId: 'oil', qty: '10', unit: 'ml' },
        ]
      : normalized.includes('salata')
        ? [
            { ingredientId: 'tomato', qty: '90', unit: 'gr' },
            { ingredientId: 'cucumber', qty: '80', unit: 'gr' },
            { ingredientId: 'olive-oil', qty: '10', unit: 'ml' },
          ]
        : [
            { ingredientId: 'water', qty: '50', unit: 'ml' },
          ];

  const category = categoryHint || 'Diğer';
  return {
    id: `smart-ai-${Date.now()}`,
    productName,
    category,
    aliases: [productName],
    ingredients: fallbackByGroup,
    variations: [
      { id: 'portion-half', name: 'Yarım', keywords: ['yarim', 'yarım', 'half'], factor: 0.5 },
      { id: 'portion-double', name: 'Duble', keywords: ['duble', 'double', 'cift', 'çift'], factor: 2 },
    ],
    modifiers: [
      { id: 'less-salt', name: 'Az içerik', keywords: ['az'], ingredientId: fallbackByGroup[0]?.ingredientId ?? 'water', qtyDelta: '-10', unit: fallbackByGroup[0]?.unit ?? 'ml' },
      { id: 'extra-main', name: 'Ekstra içerik', keywords: ['ekstra', 'bol'], ingredientId: fallbackByGroup[0]?.ingredientId ?? 'water', qtyDelta: '20', unit: fallbackByGroup[0]?.unit ?? 'ml' },
    ],
    defaultWastageRate: inferDefaultWastageRate(category),
  };
}

export function getRecipeTemplateMarketplace(query = ''): MarketplaceTemplate[] {
  const pool = loadStoredRecipePool() ?? getDefaultRecipePoolState();
  const normalizedQuery = normalizeText(query);

  return pool.recipes
    .filter((recipe) => {
      if (!normalizedQuery) return true;
      return normalizeText(`${recipe.name} ${recipe.category}`).includes(normalizedQuery);
    })
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      tags: [
        normalizeText(recipe.category).includes('kahve') ? '3.nesil kahve' : 'sıcak mutfak',
        normalizeText(recipe.name).includes('kebap') ? 'ızgara-kebap' : 'hızlı servis',
      ],
      confidenceHint: 'high',
    }));
}

export function createAiAssistedRecipeDraft(input: {
  productName: string;
  category?: string;
  variationName?: string;
  modifierNotes?: string[];
}): AiRecipeDraft {
  const recipeFromPool = upsertRecipeFromPool(input.productName, input.category ?? '');
  const recipe = recipeFromPool ?? inferRecipeByTurkishPatterns(input.productName, input.category ?? '');
  const confidence = recipeFromPool ? 0.92 : 0.66;

  const variationToken = normalizeText(input.variationName ?? '');
  if (variationToken.includes('yarim') || variationToken.includes('yarım')) {
    recipe.variations = [...recipe.variations, { id: 'explicit-half', name: 'Yarım Porsiyon', keywords: ['yarim', 'yarım'], factor: 0.5 }];
  }

  const missingIngredientIds = recipe.ingredients
    .map((line) => line.ingredientId)
    .filter((ingredientId) => !erpIngredients.some((ingredient) => ingredient.id === ingredientId));

  return {
    recipe,
    confidence,
    explanation: recipeFromPool
      ? 'Template marketplace üzerinden eşleşme bulundu, Türkiye porsiyon ve yarım/duble kuralları eklendi.'
      : 'Template bulunamadı, Türkiye restoran kalıplarına göre AI kural setiyle tahmini reçete üretildi.',
    missingIngredientIds,
  };
}

function resolvePortionFactor(note?: string) {
  const normalized = normalizeText(note ?? '');
  if (normalized.includes('yarim') || normalized.includes('yarım')) return 0.5;
  if (normalized.includes('duble') || normalized.includes('double') || normalized.includes('cift') || normalized.includes('çift')) return 2;
  return 1;
}

function resolveVariationFactor(recipe: SmartRecipeDefinition, note?: string) {
  const normalized = normalizeText(note ?? '');
  const matched = recipe.variations.find((variation) => variation.keywords.some((keyword) => normalized.includes(normalizeText(keyword))));
  return matched?.factor ?? 1;
}

function resolveRecipeIngredients(recipe: SmartRecipeDefinition, note?: string) {
  const normalized = normalizeText(note ?? '');
  const matchedVariation = recipe.variations.find((variation) => variation.overrides && variation.keywords.some((keyword) => normalized.includes(normalizeText(keyword))));

  if (!matchedVariation?.overrides) {
    return recipe.ingredients;
  }

  const merged = applyRecipeOverrides(
    recipe.ingredients.map((line) => ({ ingredientId: line.ingredientId, qty: line.qty, unit: line.unit })),
    matchedVariation.overrides,
  );

  return merged.map((line) => ({
    ingredientId: line.ingredientId,
    qty: line.qty,
    unit: line.unit,
    wastageRate: recipe.ingredients.find((item) => item.ingredientId === line.ingredientId)?.wastageRate,
  }));
}

function resolveModifierDeltas(recipe: SmartRecipeDefinition, note?: string) {
  const normalized = normalizeText(note ?? '');
  const deltas = new Map<string, { qty: number; unit: RecipePoolUnit }>();

  recipe.modifiers.forEach((modifier) => {
    const hit = modifier.keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
    if (!hit) return;
    const current = deltas.get(modifier.ingredientId);
    const nextDelta = parseQty(modifier.qtyDelta);
    deltas.set(modifier.ingredientId, {
      qty: (current?.qty ?? 0) + nextDelta,
      unit: modifier.unit,
    });
  });

  return deltas;
}

function accumulateConsumption(
  bucket: Map<string, IngredientConsumption>,
  ingredientId: string,
  stockUnit: SmartStockUnit,
  netQty: number,
  wastageQty: number,
) {
  const current = bucket.get(ingredientId);
  if (!current) {
    bucket.set(ingredientId, { ingredientId, stockUnit, netQty, wastageQty });
    return;
  }
  bucket.set(ingredientId, {
    ingredientId,
    stockUnit,
    netQty: current.netQty + netQty,
    wastageQty: current.wastageQty + wastageQty,
  });
}

function buildCostMap(branchId: BranchId) {
  const costs = new Map<string, number>();
  branchStocks
    .filter((line) => line.branchId === branchId)
    .forEach((line) => {
      costs.set(line.ingredientId, line.averageCost);
    });

  loadStoredRawIngredients().forEach((line) => {
    const parsed = parseQty(line.purchasePrice);
    if (parsed > 0 && !costs.has(line.id)) {
      costs.set(line.id, parsed);
    }
  });

  return costs;
}

export function calculateRecipeCost(recipe: SmartRecipeDefinition, branchId: BranchId) {
  const costs = buildCostMap(branchId);
  const ingredientCosts = recipe.ingredients.map((line) => {
    const stockUnit = resolveBranchStockUnit(line.ingredientId);
    const qtyInStockUnit = convertQtyToStockUnit(parseQty(line.qty), line.unit, stockUnit);
    const unitCost = costs.get(line.ingredientId) ?? 0;
    return {
      ingredientId: line.ingredientId,
      stockUnit,
      qtyInStockUnit,
      unitCost,
      total: qtyInStockUnit * unitCost,
    };
  });

  return {
    totalCost: ingredientCosts.reduce((sum, line) => sum + line.total, 0),
    lines: ingredientCosts,
  };
}

export function applyAutomaticStockDeduction(input: {
  branchId: BranchId;
  lines: SaleConsumptionLine[];
  recipes?: SmartRecipeDefinition[];
}) : StockDeductionResult {
  const stock = { ...getTheoreticalStockSnapshot(input.branchId) };
  const recipeMap = new Map<string, SmartRecipeDefinition>();

  (input.recipes ?? []).forEach((recipe) => {
    recipeMap.set(normalizeText(recipe.productName), recipe);
    recipe.aliases.forEach((alias) => recipeMap.set(normalizeText(alias), recipe));
  });

  const consumedBucket = new Map<string, IngredientConsumption>();
  const unmatchedProducts: string[] = [];

  input.lines.forEach((line) => {
    const key = normalizeText(line.name);
    const recipe = recipeMap.get(key) ?? upsertRecipeFromPool(line.name) ?? inferRecipeByTurkishPatterns(line.name);

    if (!recipe.ingredients.length) {
      unmatchedProducts.push(line.name);
      return;
    }

    const portionFactor = resolvePortionFactor(line.note);
    const variationFactor = resolveVariationFactor(recipe, line.note);
    const lineFactor = line.qty * portionFactor * variationFactor;
    const effectiveIngredients = resolveRecipeIngredients(recipe, line.note);
    const modifierDeltas = resolveModifierDeltas(recipe, line.note);

    effectiveIngredients.forEach((ingredient) => {
      const stockUnit = resolveBranchStockUnit(ingredient.ingredientId);
      const baseQty = convertQtyToStockUnit(parseQty(ingredient.qty) * lineFactor, ingredient.unit, stockUnit);
      const modifier = modifierDeltas.get(ingredient.ingredientId);
      const modifierQty = modifier
        ? convertQtyToStockUnit(modifier.qty * line.qty, modifier.unit, stockUnit)
        : 0;
      const netQty = Math.max(baseQty + modifierQty, 0);
      const wastageRate = ingredient.wastageRate ?? recipe.defaultWastageRate;
      const wastageQty = netQty * wastageRate;

      stock[ingredient.ingredientId] = Math.max((stock[ingredient.ingredientId] ?? 0) - netQty - wastageQty, 0);
      accumulateConsumption(consumedBucket, ingredient.ingredientId, stockUnit, netQty, wastageQty);
    });
  });

  const consumed = Array.from(consumedBucket.values());
  const state = loadSmartRecipeStockState();
  state.theoreticalStockByBranch[input.branchId] = stock;

  const date = todayIso();
  consumed.forEach((item) => {
    if (item.netQty > 0) {
      state.consumptionHistory.unshift({
        date,
        branchId: input.branchId,
        ingredientId: item.ingredientId,
        qty: item.netQty,
        type: 'sale',
      });
    }
    if (item.wastageQty > 0) {
      state.consumptionHistory.unshift({
        date,
        branchId: input.branchId,
        ingredientId: item.ingredientId,
        qty: item.wastageQty,
        type: 'wastage',
      });
      state.wastageEvents.unshift({
        id: `wst-${Date.now()}-${item.ingredientId}`,
        date,
        branchId: input.branchId,
        ingredientId: item.ingredientId,
        qty: item.wastageQty,
        reason: 'otomatik fire oranı',
      });
    }
  });

  state.consumptionHistory = state.consumptionHistory.slice(0, 5000);
  state.wastageEvents = state.wastageEvents.slice(0, 2000);
  saveSmartRecipeStockState(state);

  return {
    branchId: input.branchId,
    consumed,
    unmatchedProducts,
    updatedTheoreticalStock: stock,
  };
}

export function computeTheoreticalVsActual(branchId: BranchId): TheoreticalVariance[] {
  const theoretical = getTheoreticalStockSnapshot(branchId);
  const warehouseStocks = loadAllWarehouseStocks()[MAIN_WAREHOUSE_ID] ?? [];
  const rawIngredients = loadStoredRawIngredients();

  const actualMap = new Map<string, number>();
  warehouseStocks.forEach((line) => {
    actualMap.set(line.ingredientId, (actualMap.get(line.ingredientId) ?? 0) + line.quantity);
  });

  rawIngredients.forEach((line) => {
    const parsed = parseQty(line.currentQuantity);
    if (parsed <= 0) return;
    actualMap.set(line.id, Math.max(actualMap.get(line.id) ?? 0, parsed));
  });

  const ids = new Set<string>([...Object.keys(theoretical), ...actualMap.keys()]);
  return Array.from(ids).map((ingredientId) => {
    const theoreticalQty = theoretical[ingredientId] ?? 0;
    const actualQty = actualMap.get(ingredientId) ?? 0;
    const varianceQty = actualQty - theoreticalQty;
    const varianceRate = theoreticalQty > 0 ? varianceQty / theoreticalQty : 0;
    return {
      ingredientId,
      theoreticalQty,
      actualQty,
      varianceQty,
      varianceRate,
      unit: resolveBranchStockUnit(ingredientId),
    };
  });
}

export function predictLowStock(branchId: BranchId, dayWindow = 14): LowStockPrediction[] {
  const state = loadSmartRecipeStockState();
  const theoretical = getTheoreticalStockSnapshot(branchId);
  const minimumMap = new Map<string, number>();

  branchStocks
    .filter((line) => line.branchId === branchId)
    .forEach((line) => minimumMap.set(line.ingredientId, line.minimumQuantity));

  loadStoredRawIngredients().forEach((line) => {
    const parsed = parseQty(line.minimumQuantity);
    if (parsed > 0 && !minimumMap.has(line.id)) {
      minimumMap.set(line.id, parsed);
    }
  });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - dayWindow);

  const usageByIngredient = new Map<string, number>();
  state.consumptionHistory
    .filter((entry) => entry.branchId === branchId)
    .filter((entry) => new Date(`${entry.date}T00:00:00`).getTime() >= sinceDate.getTime())
    .forEach((entry) => {
      usageByIngredient.set(entry.ingredientId, (usageByIngredient.get(entry.ingredientId) ?? 0) + entry.qty);
    });

  return Object.entries(theoretical)
    .map(([ingredientId, currentQty]) => {
      const totalUsage = usageByIngredient.get(ingredientId) ?? 0;
      const avgDailyUsage = totalUsage / Math.max(dayWindow, 1);
      const daysLeft = avgDailyUsage > 0 ? currentQty / avgDailyUsage : Number.POSITIVE_INFINITY;
      const predictedRunOutDate = Number.isFinite(daysLeft)
        ? new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : null;
      return {
        ingredientId,
        currentQty,
        minimumQty: minimumMap.get(ingredientId) ?? 0,
        avgDailyUsage,
        daysLeft,
        predictedRunOutDate,
        unit: resolveBranchStockUnit(ingredientId),
      };
    })
    .filter((item) => item.currentQty <= item.minimumQty || item.daysLeft <= 5)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function ingredientFamilyScore(ingredientId: string, supplierName: string) {
  const normalizedSupplier = normalizeText(supplierName);
  if (ingredientId.includes('milk') || ingredientId.includes('cheese') || ingredientId.includes('yogurt')) {
    return normalizedSupplier.includes('sut') || normalizedSupplier.includes('süt') ? 0.8 : 0.2;
  }
  if (ingredientId.includes('meat') || ingredientId.includes('chicken') || ingredientId.includes('kebap')) {
    return normalizedSupplier.includes('et') || normalizedSupplier.includes('kasap') ? 0.8 : 0.2;
  }
  if (ingredientId.includes('coffee') || ingredientId.includes('tea')) {
    return normalizedSupplier.includes('kahve') || normalizedSupplier.includes('cay') || normalizedSupplier.includes('çay') ? 0.8 : 0.2;
  }
  return 0.4;
}

export function suggestSuppliersForLowStock(branchId: BranchId): SupplierSuggestion[] {
  const lowItems = predictLowStock(branchId);
  if (lowItems.length === 0) return [];

  const supplierCandidates = erpAccounts.filter((account) => account.type === 'supplier').map((account) => account.name);
  const invoices = loadStoredPurchaseInvoices();
  const frequency = new Map<string, number>();
  invoices.forEach((invoice) => {
    const key = invoice.supplierName.trim();
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  });

  const mergedSupplierNames = Array.from(new Set([...supplierCandidates, ...Array.from(frequency.keys())]));

  return lowItems.flatMap((item) => {
    const ranked = mergedSupplierNames
      .map((supplierName) => {
        const freq = frequency.get(supplierName) ?? 0;
        const freqScore = Math.min(freq / 10, 1);
        const familyScore = ingredientFamilyScore(item.ingredientId, supplierName);
        const confidence = Number((familyScore * 0.7 + freqScore * 0.3).toFixed(2));
        return {
          supplierName,
          confidence,
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);

    return ranked.map((entry) => ({
      ingredientId: item.ingredientId,
      supplierName: entry.supplierName,
      confidence: entry.confidence,
      reason: `${item.ingredientId} için düşük stok (${item.daysLeft.toFixed(1)} gün). Türkiye tedarik alışkanlığı ve fatura geçmişine göre önerildi.`,
    }));
  });
}

export function recordOrderForSmartStock(branchId: BranchId, lines: SaleConsumptionLine[]) {
  return applyAutomaticStockDeduction({ branchId, lines });
}

export function getRecipeMarketplaceAndSuggestions(productName: string, category = '') {
  const marketplace = getRecipeTemplateMarketplace(productName);
  const aiDraft = createAiAssistedRecipeDraft({ productName, category });
  return { marketplace, aiDraft };
}
