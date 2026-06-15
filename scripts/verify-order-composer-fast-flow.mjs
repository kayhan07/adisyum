import { readFileSync } from 'node:fs';

const source = readFileSync('components/order-composer.tsx', 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('categories are derived from active sale products', source.includes('deriveSaleProductCategories(sourceProducts)'));
check('all category is always available', source.includes("id: 'all'") && source.includes("label: 'Tümü'"));
check('all category shows all source products', source.includes("if (selectedCategory === 'all') return sourceProducts"));
check('category filter compares normalized Turkish keys', source.includes('normalizeCategoryKey(selectedCategory)'));
check('product search uses deferred input for fast typing', source.includes('useDeferredValue') && source.includes('deferredProductSearch'));
check('product card click adds product to current table', source.includes('addProductToOrder') && source.includes('product-grid'));
check('same product merge path exists through authoritative mutation', source.includes('commitOrderMutation') && source.includes('/api/pos/table-orders'));
check('line quantity plus/minus controls exist', source.includes('changeLineQuantity') && source.includes('Minus') && source.includes('Plus'));
check('line removal is controlled', source.includes('removeLine') && source.includes('remove_line'));
check('note and service preference fields exist', source.includes('extrasNote') && source.includes('removalNote') && source.includes('spicePreference'));
check('payment CTA remains easy to reach', source.includes('pos-payment-cta') && source.includes('Ödeme al'));
check('empty product state is shown', source.includes('Ürün bulunamadı') || source.includes('Urun bulunamadi') || source.includes('sourceProducts.length'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} order composer fast-flow checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} order composer fast-flow checks passed.`);
