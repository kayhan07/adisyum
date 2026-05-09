export type VatRate = 1 | 10 | 20;
export type RawUnit = 'kg' | 'lt' | 'adet';

export type StoredRawIngredient = {
  id: string;
  name: string;
  unit: RawUnit;
  purchasePrice: string;
  minimumQuantity: string;
  currentQuantity: string;
  vatRate: VatRate;
};

const STORAGE_KEY = 'adisyon-created-raw-ingredients';

function normalizeIngredientKey(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function loadStoredRawIngredients() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredRawIngredient[]) : [];
  } catch {
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...items, ...preserved]));
  } catch {
    // ignore storage errors in demo env
  }
}
