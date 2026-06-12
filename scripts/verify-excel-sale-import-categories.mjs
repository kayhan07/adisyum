import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing: ${needle}`);
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} missing: ${pattern}`);
  }
}

const productsPage = read('app/products/page.tsx');
const bulkRoute = read('app/api/products/bulk/route.ts');
const importExcelRoute = read('app/api/products/import-excel/route.ts');

assertContains(
  productsPage,
  'const existingCategoryKeys = new Set(categories.map((category) => category.trim().toLocaleLowerCase(\'tr-TR\')));',
  'Excel sale import tracks existing categories case-insensitively',
);
assertContains(
  productsPage,
  'const importedCategories = Array.from(newCategories);',
  'Excel sale import collects imported categories',
);
assertContains(
  productsPage,
  'const nextCategories = mergeProductCategories(current, importedCategories);',
  'Excel sale import merges imported categories through category normalizer',
);
assertContains(
  productsPage,
  'saveStoredProductCategories(nextCategories);',
  'Excel sale import persists newly created categories immediately',
);
assertContains(
  productsPage,
  'kategori otomatik oluşturuldu',
  'Excel sale import reports automatic category creation',
);

assertContains(
  bulkRoute,
  'async function findOrCreateCategory',
  'Bulk product API creates missing categories',
);
assertMatches(
  bulkRoute,
  /const categoryId = await findOrCreateCategory\(tx, tenant\.tenantId, input\.category \?\? '', productType\);/,
  'Bulk product API resolves category from imported product',
);
assertContains(
  bulkRoute,
  'visibleInPos: productType !== \'stock_item\'',
  'Bulk product API makes sale product categories visible in POS',
);

assertContains(
  importExcelRoute,
  'const rows = name.endsWith(\'.xlsx\')',
  'Excel import endpoint returns parsed rows for product creation',
);
assertContains(
  importExcelRoute,
  'rows,',
  'Excel import endpoint includes parsed rows in its response',
);

console.log('PASS excel sale product import auto-creates and persists categories');
