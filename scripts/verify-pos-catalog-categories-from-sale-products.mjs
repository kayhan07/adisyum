import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function assertContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label} missing: ${needle}`);
}

function assertNotContains(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label} must not contain: ${needle}`);
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`${label} missing: ${pattern}`);
}

const orderComposer = read('components/order-composer.tsx');
const runtimeCatalog = read('lib/server/runtime-pos-catalog.ts');
const posCatalogRoute = read('app/api/runtime/pos-catalog/route.ts');
const productsBulkRoute = read('app/api/products/bulk/route.ts');
const productsPage = read('app/products/page.tsx');
const packageJson = read('package.json');

assertContains(orderComposer, 'function deriveSaleProductCategories(products: ProductCard[])', 'Order composer derives categories from catalog products');
assertContains(orderComposer, "product.productType !== 'sale_product' && product.productType !== 'combo_product'", 'Order composer excludes non-sale products from categories');
assertContains(orderComposer, "{ id: 'all', label: 'Tümü' }", 'Order composer keeps only the all category as static control');
assertContains(orderComposer, 'const sourceCategories = useMemo(() => deriveSaleProductCategories(sourceProducts), [sourceProducts]);', 'Order composer category source is runtime catalog products');
assertContains(orderComposer, "setSelectedCategory('all')", 'Order composer resets missing selected category to all');
assertContains(orderComposer, 'normalizeCategoryKey(product.category) === selectedKey', 'Order composer filters categories with Turkish-safe normalization');
assertNotContains(orderComposer, "{ id: 'kahve', label: 'Kahve' }", 'Order composer no longer hardcodes Kahve');
assertNotContains(orderComposer, "{ id: 'mutfak', label: 'Mutfak' }", 'Order composer no longer hardcodes Mutfak');
assertNotContains(orderComposer, "{ id: 'icecek', label:", 'Order composer no longer hardcodes Içecek');
assertNotContains(orderComposer, "{ id: 'tatli', label:", 'Order composer no longer hardcodes Tatlı');

assertContains(runtimeCatalog, 'tenantId,', 'Runtime POS catalog is called with tenant id');
assertContains(runtimeCatalog, 'active: true', 'Runtime POS catalog filters active products');
assertContains(runtimeCatalog, "publishStatus: 'published'", 'Runtime POS catalog filters published products');
assertContains(runtimeCatalog, "productType: { in: ['sale_product', 'combo_product'] }", 'Runtime POS catalog excludes raw materials');
assertContains(posCatalogRoute, 'const tenant = await requireTenant(request);', 'POS catalog route uses authenticated tenant');
assertContains(posCatalogRoute, 'compileTenantPosCatalog(tenant.tenantId', 'POS catalog ignores caller supplied tenant id');
assertContains(productsBulkRoute, 'invalidateRuntimePosCatalog', 'Bulk import invalidates runtime POS catalog');
assertContains(productsPage, 'setSaleProducts(serverSaleProducts);', 'Products page treats server product hydration as authoritative');
assertContains(productsPage, 'saveStoredSaleProducts(serverSaleProducts as StoredSaleProduct[]);', 'Products page clears stale local product cache after server reset');
assertMatches(packageJson, /"verify:pos-catalog-categories"\s*:/, 'package.json exposes POS catalog category verification');

console.log('PASS POS categories are derived from tenant active sale products');
