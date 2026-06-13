import { readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function expect(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

function normalizeProductName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}

const helper = read('lib/product-name-normalization.ts');
const productsPage = read('app/products/page.tsx');
const bulkRoute = read('app/api/products/bulk/route.ts');
const saleCatalog = read('lib/sale-product-catalog.ts');
const runtimeCatalog = read('lib/server/runtime-pos-catalog.ts');
const orderComposer = read('components/order-composer.tsx');
const packageJson = JSON.parse(read('package.json'));

expect(
  'helper trims, collapses whitespace and uses Turkish uppercase',
  helper.includes("replace(/\\s+/g, ' ')") && helper.includes("toLocaleUpperCase('tr-TR')"),
);
expect('manual sale product uses normalized draft name', productsPage.includes('const normalizedDraftName = normalizeProductName(newItemDraft.name)'));
expect('manual raw/semi product stores normalized name', productsPage.includes('name: normalizedDraftName'));
expect('quick sale product normalizes name before duplicate check', productsPage.includes('const trimmedName = normalizeProductName(quickSaleDraft.name)'));
expect('Excel raw import normalizes item name', productsPage.includes("const name = normalizeProductName(cells[0] ?? '')"));
expect('Excel sale import duplicate key uses normalized product name', productsPage.includes('const normalizedName = normalizeProductNameKey(name)'));
expect('product update normalizes patched name', productsPage.includes('name: normalizeProductName(patch.name)'));
expect('duplicate product names use normalized key', productsPage.includes('normalizeProductNameKey(firstCandidate)'));
expect('bulk API persists normalized product name', bulkRoute.includes('const name = normalizeProductName(cleanText(input.name))'));
expect('bulk API updates existing row name to normalized value', bulkRoute.includes('data: {\n              name,'));
expect('bulk API list returns normalized product name', bulkRoute.includes('name: normalizeProductName(product.name)'));
expect('local stored sale product normalization is centralized', saleCatalog.includes('const productName = normalizeProductName(product.name)'));
expect('runtime POS catalog snapshot uses normalized product name', runtimeCatalog.includes('const productName = normalizeProductName(product.name)') && runtimeCatalog.includes('name: productName'));
expect('order composer stores normalized order mutation product name', orderComposer.includes('const productName = normalizeProductName(product.name)') && orderComposer.includes('name: productName'));
expect('order composer displays normalized product names', orderComposer.includes('{normalizeProductName(product.name)}'));
expect(
  'package script is registered',
  packageJson.scripts?.['verify:product-name-uppercase'] === 'node scripts/verify-product-name-uppercase-normalization.mjs',
);

const turkishCases = new Map([
  ['adana kebap', 'ADANA KEBAP'],
  ['içecek menü', 'İÇECEK MENÜ'],
  ['çoban salata', 'ÇOBAN SALATA'],
  ['  ayran   büyük  ', 'AYRAN BÜYÜK'],
  ['çiğ köfte', 'ÇİĞ KÖFTE'],
]);

for (const [input, expected] of turkishCases) {
  const actual = normalizeProductName(input);
  expect(`Turkish uppercase: ${input} -> ${expected}`, actual === expected, `actual=${actual}`);
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} product name uppercase normalization checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} product name uppercase normalization checks passed.`);
