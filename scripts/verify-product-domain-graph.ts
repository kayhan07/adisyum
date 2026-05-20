import assert from 'node:assert/strict';
import {
  coerceCategoryForProductType,
  getCategoryDomainDefinition,
  getCategoryOptionsForProductType,
  validateProductDomainGraph,
} from '../lib/product-domain-graph';
import { compileCanonicalPosCatalog } from '../lib/canonical-pos-catalog';
import { createPosKey } from '../lib/product-identity';

const stockCategory = getCategoryDomainDefinition('Hammaddeler');
const saleCategory = getCategoryDomainDefinition('İçecekler');
const semiCategory = getCategoryDomainDefinition('Yarı Mamüller');
const comboCategory = getCategoryDomainDefinition('Combo');

assert.deepEqual(stockCategory.allowedProductTypes, ['stock_item']);
assert.deepEqual(saleCategory.allowedProductTypes, ['sale_product']);
assert.deepEqual(semiCategory.allowedProductTypes, ['semi_product']);
assert.deepEqual(comboCategory.allowedProductTypes, ['combo_product']);

assert.equal(validateProductDomainGraph({ name: 'Süt', category: 'Hammaddeler', productType: 'stock_item' }).ok, true);
assert.equal(validateProductDomainGraph({ name: 'Süt', category: 'İçecekler', productType: 'stock_item' }).ok, false);
assert.equal(validateProductDomainGraph({ name: 'Latte', category: 'İçecekler', productType: 'sale_product', price: 145 }).runtimeVisible, true);
assert.equal(validateProductDomainGraph({ name: 'Latte', category: 'Hammaddeler', productType: 'sale_product', price: 145 }).runtimeVisible, false);
assert.equal(validateProductDomainGraph({ name: 'Sos', category: 'Yarı Mamüller', productType: 'semi_product' }).posVisible, false);
assert.equal(validateProductDomainGraph({ name: 'Ekstra Peynir', category: 'Modifier', productType: 'modifier' }).posVisible, false);

const categoryOptions = getCategoryOptionsForProductType(['Kahve', 'Hammaddeler', 'Yarı Mamüller'], 'sale_product');
assert.equal(categoryOptions.includes('Hammaddeler'), false);
assert.equal(coerceCategoryForProductType('Hammaddeler', 'sale_product', categoryOptions), 'Satış Ürünleri');

const posKey = createPosKey('latte');
const runtimeValidation = validateProductDomainGraph({
  name: 'Latte',
  category: 'İçecekler',
  productType: 'sale_product',
  posKey,
  catalogRevision: 'CAT-TEST',
  price: 145,
  productSnapshot: { posKey, name: 'Latte', category: 'İçecekler', productType: 'sale_product', price: 145, revision: 1 },
}, { requireRuntimeFields: true });
assert.equal(runtimeValidation.runtimeVisible, true);

const catalog = compileCanonicalPosCatalog([
  {
    id: posKey,
    productId: 'latte',
    posKey,
    revision: 1,
    lifecycleStatus: 'published',
    publishStatus: 'published',
    deletedAt: null,
    name: 'Latte',
    category: 'İçecekler',
    productType: 'sale_product',
    salesUnit: 'portion',
    price: 145,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
  },
  {
    id: createPosKey('milk'),
    productId: 'milk',
    posKey: createPosKey('milk'),
    revision: 1,
    lifecycleStatus: 'published',
    publishStatus: 'published',
    deletedAt: null,
    name: 'Süt',
    category: 'Hammaddeler',
    productType: 'stock_item',
    salesUnit: 'portion',
    price: 42,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
  },
], { tenantId: 'ABN-48291', branchId: 'mrk', channel: 'pos' });

assert.equal(catalog.itemCount, 1);
assert.equal(catalog.items[0].productSnapshot.category, 'İçecekler');

console.log('product domain graph valid');
