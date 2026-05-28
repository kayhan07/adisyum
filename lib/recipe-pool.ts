export type RecipePoolUnit = 'kg' | 'gr' | 'lt' | 'ml' | 'adet';

export type RecipePoolIngredientLine = {
  ingredientId: string;
  qty: string;
  unit: RecipePoolUnit;
};

export type RecipePoolRecipe = {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'draft';
};

export type RecipePoolVersion = {
  id: string;
  recipeId: string;
  versionNo: number;
  published: boolean;
  ingredients: RecipePoolIngredientLine[];
};

export type ProductRecipeOverride = {
  ingredientId: string;
  qtyDelta: string;
  unit: RecipePoolUnit;
};

type StoredRecipePoolState = {
  recipes: RecipePoolRecipe[];
  versions: RecipePoolVersion[];
};

type DefaultRecipeTemplate = {
  id: string;
  name: string;
  category?: string;
  keywords: string[];
  ingredients: RecipePoolIngredientLine[];
};

import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';
import { loadSessionState } from '@/lib/session-store';

const STORAGE_KEY = 'adisyon-recipe-pool';
const LOCAL_STORAGE_KEY = 'adisyum-local-recipe-pool';

function localRecipePoolKey() {
  const tenantId = loadSessionState().tenantId || 'ABN-48291';
  return `${LOCAL_STORAGE_KEY}:${tenantId}`;
}

const DEFAULT_RECIPE_TEMPLATES: DefaultRecipeTemplate[] = [
  {
    id: 'pool-espresso',
    name: 'Kahve / Espresso',
    keywords: ['espresso'],
    ingredients: [{ ingredientId: 'coffee-bean', qty: '8', unit: 'gr' }],
  },
  {
    id: 'pool-americano',
    name: 'Kahve / Americano',
    keywords: ['americano'],
    ingredients: [
      { ingredientId: 'coffee-bean', qty: '8', unit: 'gr' },
      { ingredientId: 'water', qty: '150', unit: 'ml' },
    ],
  },
  {
    id: 'pool-latte',
    name: 'Kahve / Latte',
    keywords: ['latte', 'caffe latte'],
    ingredients: [
      { ingredientId: 'milk', qty: '200', unit: 'ml' },
      { ingredientId: 'coffee-bean', qty: '10', unit: 'gr' },
    ],
  },
  {
    id: 'pool-cappuccino',
    name: 'Kahve / Cappuccino',
    keywords: ['cappuccino'],
    ingredients: [
      { ingredientId: 'milk', qty: '150', unit: 'ml' },
      { ingredientId: 'coffee-bean', qty: '10', unit: 'gr' },
    ],
  },
  {
    id: 'pool-turkish-coffee',
    name: 'Kahve / Türk Kahvesi',
    keywords: ['türk kahvesi', 'turk kahvesi'],
    ingredients: [
      { ingredientId: 'turkish-coffee', qty: '7', unit: 'gr' },
      { ingredientId: 'water', qty: '70', unit: 'ml' },
    ],
  },
  {
    id: 'pool-tea',
    name: 'İçecek / Çay',
    keywords: ['çay', 'cay', 'tea'],
    ingredients: [
      { ingredientId: 'tea', qty: '5', unit: 'gr' },
      { ingredientId: 'water', qty: '200', unit: 'ml' },
    ],
  },
  {
    id: 'pool-ayran',
    name: 'İçecek / Ayran',
    keywords: ['ayran'],
    ingredients: [
      { ingredientId: 'yogurt', qty: '100', unit: 'gr' },
      { ingredientId: 'water', qty: '100', unit: 'ml' },
    ],
  },
  {
    id: 'pool-lemonade',
    name: 'İçecek / Limonata',
    keywords: ['limonata', 'lemonade'],
    ingredients: [
      { ingredientId: 'lemon-juice', qty: '50', unit: 'ml' },
      { ingredientId: 'sugar', qty: '20', unit: 'gr' },
      { ingredientId: 'water', qty: '200', unit: 'ml' },
    ],
  },
  {
    id: 'pool-cola',
    name: 'İçecek / Kola',
    keywords: ['kola', 'cola'],
    ingredients: [{ ingredientId: 'cola', qty: '250', unit: 'ml' }],
  },
  {
    id: 'pool-sparkling-water',
    name: 'İçecek / Maden Suyu',
    keywords: ['maden suyu', 'soda'],
    ingredients: [{ ingredientId: 'sparkling-water', qty: '1', unit: 'adet' }],
  },
  {
    id: 'pool-fresh-juice',
    name: 'İçecek / Taze Meyve Suyu',
    keywords: ['meyve suyu', 'fresh juice', 'taze meyve suyu'],
    ingredients: [{ ingredientId: 'orange', qty: '250', unit: 'gr' }],
  },
  {
    id: 'pool-menemen',
    name: 'Kahvaltı / Menemen',
    keywords: ['menemen'],
    ingredients: [
      { ingredientId: 'egg', qty: '2', unit: 'adet' },
      { ingredientId: 'tomato', qty: '100', unit: 'gr' },
      { ingredientId: 'pepper', qty: '50', unit: 'gr' },
      { ingredientId: 'olive-oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-omelette',
    name: 'Kahvaltı / Omlet',
    keywords: ['omlet', 'omelette'],
    ingredients: [
      { ingredientId: 'egg', qty: '2', unit: 'adet' },
      { ingredientId: 'butter', qty: '10', unit: 'gr' },
    ],
  },
  {
    id: 'pool-serpme-breakfast',
    name: 'Kahvaltı / Serpme Kahvaltı Baz',
    keywords: ['serpme kahvaltı', 'kahvalti tabağı', 'kahvalti tabagi'],
    ingredients: [
      { ingredientId: 'cheese', qty: '100', unit: 'gr' },
      { ingredientId: 'olive', qty: '50', unit: 'gr' },
      { ingredientId: 'tomato', qty: '100', unit: 'gr' },
      { ingredientId: 'cucumber', qty: '100', unit: 'gr' },
      { ingredientId: 'bread', qty: '200', unit: 'gr' },
    ],
  },
  {
    id: 'pool-coban-salad',
    name: 'Salata / Çoban Salata',
    keywords: ['çoban salata', 'coban salata'],
    ingredients: [
      { ingredientId: 'tomato', qty: '120', unit: 'gr' },
      { ingredientId: 'cucumber', qty: '100', unit: 'gr' },
      { ingredientId: 'onion', qty: '40', unit: 'gr' },
      { ingredientId: 'olive-oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-mevsim-salad',
    name: 'Salata / Mevsim Salata',
    keywords: ['mevsim salata'],
    ingredients: [
      { ingredientId: 'lettuce', qty: '100', unit: 'gr' },
      { ingredientId: 'tomato', qty: '80', unit: 'gr' },
      { ingredientId: 'cucumber', qty: '80', unit: 'gr' },
      { ingredientId: 'olive-oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-hamburger',
    name: 'Fast Food / Hamburger',
    keywords: ['hamburger', 'burger'],
    ingredients: [
      { ingredientId: 'burger-bun', qty: '1', unit: 'adet' },
      { ingredientId: 'burger-patty', qty: '1', unit: 'adet' },
      { ingredientId: 'lettuce', qty: '20', unit: 'gr' },
      { ingredientId: 'tomato', qty: '30', unit: 'gr' },
    ],
  },
  {
    id: 'pool-cheeseburger',
    name: 'Fast Food / Cheeseburger',
    keywords: ['cheeseburger'],
    ingredients: [
      { ingredientId: 'burger-bun', qty: '1', unit: 'adet' },
      { ingredientId: 'burger-patty', qty: '1', unit: 'adet' },
      { ingredientId: 'cheese', qty: '20', unit: 'gr' },
    ],
  },
  {
    id: 'pool-fries',
    name: 'Fast Food / Patates Kızartması',
    keywords: ['patates', 'fries', 'patates kizartmasi', 'patates kızartması'],
    ingredients: [
      { ingredientId: 'potato', qty: '200', unit: 'gr' },
      { ingredientId: 'oil', qty: '50', unit: 'ml' },
    ],
  },
  {
    id: 'pool-margherita',
    name: 'Pizza / Margherita',
    keywords: ['margherita', 'pizza'],
    ingredients: [
      { ingredientId: 'pizza-dough', qty: '1', unit: 'adet' },
      { ingredientId: 'tomato-sauce', qty: '80', unit: 'gr' },
      { ingredientId: 'cheese', qty: '100', unit: 'gr' },
    ],
  },
  {
    id: 'pool-pasta-base',
    name: 'Makarna / Makarna Baz',
    keywords: ['makarna', 'pasta'],
    ingredients: [
      { ingredientId: 'pasta', qty: '100', unit: 'gr' },
      { ingredientId: 'oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-cream-pasta',
    name: 'Makarna / Kremalı Makarna',
    keywords: ['kremali makarna', 'kremalı makarna', 'cream pasta'],
    ingredients: [
      { ingredientId: 'pasta', qty: '100', unit: 'gr' },
      { ingredientId: 'cream', qty: '80', unit: 'ml' },
    ],
  },
  {
    id: 'pool-grilled-chicken',
    name: 'Ana Yemek / Izgara Tavuk',
    keywords: ['izgara tavuk', 'grilled chicken'],
    ingredients: [
      { ingredientId: 'chicken', qty: '200', unit: 'gr' },
      { ingredientId: 'oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-grilled-meat',
    name: 'Ana Yemek / Izgara Et',
    keywords: ['izgara et', 'grilled meat'],
    ingredients: [
      { ingredientId: 'meat', qty: '200', unit: 'gr' },
      { ingredientId: 'oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-adana',
    name: 'Kebap / Adana Kebap',
    keywords: ['adana'],
    ingredients: [
      { ingredientId: 'minced-meat', qty: '180', unit: 'gr' },
      { ingredientId: 'tail-fat', qty: '20', unit: 'gr' },
    ],
  },
  {
    id: 'pool-urfa',
    name: 'Kebap / Urfa Kebap',
    keywords: ['urfa'],
    ingredients: [{ ingredientId: 'minced-meat', qty: '180', unit: 'gr' }],
  },
  {
    id: 'pool-chicken-shish',
    name: 'Kebap / Tavuk Şiş',
    keywords: ['tavuk şiş', 'tavuk sis', 'chicken shish'],
    ingredients: [
      { ingredientId: 'chicken', qty: '200', unit: 'gr' },
      { ingredientId: 'oil', qty: '10', unit: 'ml' },
    ],
  },
  {
    id: 'pool-lahmacun',
    name: 'Kebap / Lahmacun',
    keywords: ['lahmacun'],
    ingredients: [
      { ingredientId: 'lahmacun-dough', qty: '100', unit: 'gr' },
      { ingredientId: 'minced-meat', qty: '80', unit: 'gr' },
      { ingredientId: 'tomato', qty: '50', unit: 'gr' },
    ],
  },
  {
    id: 'pool-chicken-wrap',
    name: 'Dürüm / Tavuk Dürüm',
    keywords: ['tavuk dürüm', 'tavuk durum', 'chicken wrap'],
    ingredients: [
      { ingredientId: 'lavash', qty: '1', unit: 'adet' },
      { ingredientId: 'chicken', qty: '150', unit: 'gr' },
      { ingredientId: 'lettuce', qty: '30', unit: 'gr' },
    ],
  },
  {
    id: 'pool-meat-wrap',
    name: 'Dürüm / Et Dürüm',
    keywords: ['et dürüm', 'et durum', 'meat wrap'],
    ingredients: [
      { ingredientId: 'lavash', qty: '1', unit: 'adet' },
      { ingredientId: 'meat', qty: '150', unit: 'gr' },
    ],
  },
  {
    id: 'pool-kuru-fasulye',
    name: 'Geleneksel / Kuru Fasulye',
    keywords: ['kuru fasulye'],
    ingredients: [
      { ingredientId: 'beans', qty: '150', unit: 'gr' },
      { ingredientId: 'oil', qty: '20', unit: 'ml' },
    ],
  },
  {
    id: 'pool-pilav',
    name: 'Geleneksel / Pilav',
    keywords: ['pilav', 'pirinç pilavı', 'pirinc pilavi'],
    ingredients: [
      { ingredientId: 'rice', qty: '120', unit: 'gr' },
      { ingredientId: 'butter', qty: '10', unit: 'gr' },
    ],
  },
  {
    id: 'pool-baklava',
    name: 'Tatlı / Baklava',
    keywords: ['baklava'],
    ingredients: [
      { ingredientId: 'baklava-dough', qty: '100', unit: 'gr' },
      { ingredientId: 'syrup', qty: '50', unit: 'ml' },
    ],
  },
  {
    id: 'pool-kunefe',
    name: 'Tatlı / Künefe',
    keywords: ['künefe', 'kunefe'],
    ingredients: [
      { ingredientId: 'kunefe-cheese', qty: '100', unit: 'gr' },
      { ingredientId: 'syrup', qty: '50', unit: 'ml' },
    ],
  },
  {
    id: 'pool-waffle',
    name: 'Tatlı / Waffle',
    keywords: ['waffle'],
    ingredients: [
      { ingredientId: 'waffle-dough', qty: '150', unit: 'gr' },
      { ingredientId: 'chocolate', qty: '50', unit: 'gr' },
    ],
  },
  {
    id: 'pool-tiramisu',
    name: 'Tatlı / Tiramisu',
    keywords: ['tiramisu'],
    ingredients: [{ ingredientId: 'dessert-base', qty: '1', unit: 'adet' }],
  },
];

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function categoryFromRecipeName(name: string) {
  return name.includes('/') ? name.split('/')[0]?.trim() || 'Diğer' : 'Diğer';
}

function normalizeRecipe(recipe: RecipePoolRecipe): RecipePoolRecipe {
  return {
    ...recipe,
    category: recipe.category || categoryFromRecipeName(recipe.name),
  };
}

export function getDefaultRecipePoolState(): StoredRecipePoolState {
  return {
    recipes: DEFAULT_RECIPE_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category ?? categoryFromRecipeName(template.name),
      status: 'active',
    })),
    versions: DEFAULT_RECIPE_TEMPLATES.map((template) => ({
      id: `${template.id}-v1`,
      recipeId: template.id,
      versionNo: 1,
      published: true,
      ingredients: template.ingredients,
    })),
  };
}

export function mergeRecipePoolStates(
  ...states: Array<StoredRecipePoolState | null | undefined>
): StoredRecipePoolState {
  const recipeByName = new Map<string, RecipePoolRecipe>();
  const versionsByName = new Map<string, RecipePoolVersion[]>();

  states.forEach((state) => {
    if (!state) return;

    state.recipes.forEach((recipe) => {
      const normalizedName = normalizeText(recipe.name);
      recipeByName.set(normalizedName, normalizeRecipe(recipe));
      versionsByName.set(
        normalizedName,
        state.versions.filter((version) => version.recipeId === recipe.id),
      );
    });
  });

  return {
    recipes: Array.from(recipeByName.values()),
    versions: Array.from(versionsByName.values()).flat(),
  };
}

export function suggestRecipeTemplateId(productName: string, category = '') {
  const normalizedTarget = `${normalizeText(productName)} ${normalizeText(category)}`;
  const matchedTemplate = DEFAULT_RECIPE_TEMPLATES.find((template) =>
    template.keywords.some((keyword) => normalizedTarget.includes(normalizeText(keyword))),
  );

  return matchedTemplate?.id;
}

export function loadStoredRecipePool() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const tenantId = loadSessionState().tenantId || 'ABN-48291';
    const raw = window.localStorage.getItem(localRecipePoolKey())
      ?? (tenantId === 'ABN-48291' ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null)
      ?? readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRecipePoolState;
    if (!Array.isArray(parsed?.recipes) || !Array.isArray(parsed?.versions)) {
      return null;
    }
    return {
      recipes: parsed.recipes.map(normalizeRecipe),
      versions: parsed.versions,
    };
  } catch (error) {
    console.error('[business-flow] recipe pool load failed', error);
    return null;
  }
}

export function saveStoredRecipePool(recipes: RecipePoolRecipe[], versions: RecipePoolVersion[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const merged = mergeRecipePoolStates(loadStoredRecipePool(), { recipes, versions });
    const serialized = JSON.stringify(merged);
    window.localStorage.setItem(localRecipePoolKey(), serialized);
    writeRuntimeItem('tenant', STORAGE_KEY, serialized);
  } catch (error) {
    console.error('[business-flow] recipe pool save failed', error);
  }
}

export function getLatestPublishedRecipeVersion(recipeId: string | undefined, versions: RecipePoolVersion[]) {
  if (!recipeId) return null;

  return versions
    .filter((version) => version.recipeId === recipeId && version.published)
    .sort((a, b) => b.versionNo - a.versionNo)[0] ?? null;
}

export function applyRecipeOverrides(
  baseLines: RecipePoolIngredientLine[],
  overrides: ProductRecipeOverride[],
) {
  const lineMap = new Map(
    baseLines.map((line) => [
      line.ingredientId,
      { ...line, qty: Number(String(line.qty).replace(',', '.')) || 0 },
    ]),
  );

  overrides.forEach((override) => {
    const delta = Number(String(override.qtyDelta).replace(',', '.')) || 0;
    const current = lineMap.get(override.ingredientId);

    if (current) {
      current.qty += delta;
      current.unit = override.unit;
      if (current.qty <= 0) {
        lineMap.delete(override.ingredientId);
      }
      return;
    }

    if (delta > 0) {
      lineMap.set(override.ingredientId, {
        ingredientId: override.ingredientId,
        qty: delta,
        unit: override.unit,
      });
    }
  });

  return Array.from(lineMap.values()).map((line) => ({
    ingredientId: line.ingredientId,
    qty: String(line.qty),
    unit: line.unit,
  }));
}

export function buildRecipeOverrides(
  baseLines: RecipePoolIngredientLine[],
  effectiveLines: RecipePoolIngredientLine[],
) {
  const baseMap = new Map(
    baseLines.map((line) => [line.ingredientId, { qty: Number(String(line.qty).replace(',', '.')) || 0, unit: line.unit }]),
  );
  const effectiveMap = new Map(
    effectiveLines.map((line) => [
      line.ingredientId,
      { qty: Number(String(line.qty).replace(',', '.')) || 0, unit: line.unit },
    ]),
  );

  const allIds = new Set([...baseMap.keys(), ...effectiveMap.keys()]);
  const overrides: ProductRecipeOverride[] = [];

  allIds.forEach((ingredientId) => {
    const base = baseMap.get(ingredientId);
    const effective = effectiveMap.get(ingredientId);
    const delta = (effective?.qty ?? 0) - (base?.qty ?? 0);

    if (Math.abs(delta) < 0.000001) {
      return;
    }

    overrides.push({
      ingredientId,
      qtyDelta: String(delta),
      unit: effective?.unit ?? base?.unit ?? 'adet',
    });
  });

  return overrides;
}
