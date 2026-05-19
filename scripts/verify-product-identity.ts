import assert from 'node:assert/strict';
import { createPosKey, isLegacyRuntimeProductKey, isUuidIdentity, resolveProductIdentity } from '../lib/product-identity';
import { buildPosCatalogFromStored, type StoredSaleProduct } from '../lib/sale-product-catalog';

const legacyProduct: StoredSaleProduct = {
  id: 'Caffe Latte',
  name: 'Caffe Latte',
  category: 'Kahve',
  productType: 'sale_product',
  salesUnit: 'portion',
  salePrice: '145',
  salePrice1: '145',
  salePrice2: '145',
  salePrice3: '145',
  price1WindowEnabled: true,
  price1Start: '',
  price1End: '',
  price2WindowEnabled: false,
  price2Start: '',
  price2End: '',
  allowComplimentary: true,
  allowDiscount: true,
  happyHourEligible: true,
  eventPriceEligible: true,
  vatRate: 10,
  salesCount: 0,
  recipeLines: [],
  source: 'created',
};

const identity = resolveProductIdentity({ id: legacyProduct.id, name: legacyProduct.name });
assert.equal(identity.posKey.startsWith('POS-'), true);
assert.equal(identity.legacyKey, 'Caffe Latte');
assert.equal(isLegacyRuntimeProductKey('Caffe Latte'), true);
assert.equal(isLegacyRuntimeProductKey(identity.posKey), false);
assert.equal(isUuidIdentity('af12c58a-81ec-4dd1-9c7a-bb0f9a761b22'), true);
assert.equal(createPosKey('Caffe Latte'), identity.posKey);

const catalog = buildPosCatalogFromStored([legacyProduct]);
assert.equal(catalog.length, 1);
assert.equal(catalog[0].id, identity.posKey);
assert.equal(catalog[0].posKey, identity.posKey);
assert.equal(catalog[0].productId, 'Caffe Latte');
assert.equal(catalog[0].legacyKey, 'Caffe Latte');

console.log('product identity valid');
