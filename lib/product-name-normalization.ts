export function normalizeProductName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}

export function normalizeProductNameKey(name: string): string {
  return normalizeProductName(name).toLocaleLowerCase('tr-TR');
}
