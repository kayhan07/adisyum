import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';

export type VatRate = 1 | 10 | 20;
export type RawUnit = 'kg' | 'lt' | 'adet';

export type StoredRawIngredient = {
  id: string;
  name: string;
  productType?: 'stock_item' | 'semi_product';
  unit: RawUnit;
  purchasePrice: string;
  minimumQuantity: string;
  currentQuantity: string;
  vatRate: VatRate;
};

const STORAGE_KEY = 'adisyon-created-raw-ingredients';
const LOCAL_STORAGE_KEY = 'adisyum-local-created-raw-ingredients';

function normalizeIngredientKey(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function readLocalRawIngredients() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.error('[business-flow] local raw ingredients read failed', error);
    return null;
  }
}

function writeLocalRawIngredients(value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
  } catch (error) {
    console.error('[business-flow] local raw ingredients save failed', error);
  }
}

export function loadStoredRawIngredients() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readLocalRawIngredients() ?? readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredRawIngredient[]) : [];
  } catch (error) {
    console.error('[business-flow] raw ingredients load failed', error);
    return [];
  }
}

export function saveStoredRawIngredients(items: StoredRawIngredient[]) {
  if (typeof window === 'undefined') return;

  try {
    const existing = loadStoredRawIngredients();
    const incomingKeys = new Set(items.flatMap((item) => [item.id, normalizeIngredientKey(item.name)]));
    const preserved = existing.filter(
      (item) => !incomingKeys.has(item.id) && !incomingKeys.has(normalizeIngredientKey(item.name)),
    );
    const serialized = JSON.stringify([...items, ...preserved]);
    writeLocalRawIngredients(serialized);
    writeRuntimeItem('tenant', STORAGE_KEY, serialized);
  } catch (error) {
    console.error('[business-flow] raw ingredients save failed', error);
  }
}
