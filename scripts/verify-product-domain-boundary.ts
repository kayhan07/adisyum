import assert from 'node:assert/strict';
import {
  canCategoryAcceptProductType,
  filterSellableProducts,
  inferProductDomainType,
  isSellableProductType,
  resolveProductDomainType,
} from '../lib/product-domain';
import { buildPosCatalogFromStored, type StoredSaleProduct } from '../lib/sale-product-catalog';

const baseSaleProduct: StoredSaleProduct = {
  id: 'latte',
  name: 'Caffe Latte',
  category: 'Kahve',
  productType: 'sale_product',
  salesUnit: 'portion',
  currentStock: '0',
  stockProcurementType: 'recipe',
  barStockMode: 'none',
  glassesPerBottle: '6',
  bottleVolumeCl: '70',
  portionVolumeCl: '5',
  initialBottleCount: '0',
  dispensedPortions: '0',
  openBottleSnapshots: [],
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
  fixedMenu: false,
  happyHourEligible: true,
  eventPriceEligible: true,
  vatRate: 10,
  salesCount: 0,
  recipeLines: [],
  portionMultiplier: '1',
  recipeOverrides: [],
  wastePercentage: '0',
  operationalCost: '0',
  source: 'created',
};

const stockItem = {
  ...baseSaleProduct,
  id: 'milk',
  name: 'Sut',
  category: 'Hammadde / Stok',
  productType: 'stock_item' as const,
};

const semiProduct = {
  ...baseSaleProduct,
  id: 'sauce',
  name: 'Hazir Sos',
  category: 'Hazirlik',
  productType: 'semi_product' as const,
};

const comboProduct = {
  ...baseSaleProduct,
  id: 'family-combo',
  name: 'Aile Paketi',
  category: 'Menuler',
  productType: 'combo_product' as const,
};

const legacyMisclassifiedSaleProduct = {
  ...baseSaleProduct,
  id: 'sutlac',
  name: 'Sutlac',
  category: 'Tatli',
  productType: 'stock_item' as const,
  salePrice: '180',
  salePrice1: '180',
};

assert.equal(inferProductDomainType({ name: 'Sut', category: 'Hammadde / Stok' }), 'stock_item');
assert.equal(inferProductDomainType({ name: 'Sutlac', category: 'Tatli' }), 'sale_product');
assert.equal(inferProductDomainType({ name: 'Hazir Sos', category: 'Hazirlik' }), 'semi_product');
assert.equal(inferProductDomainType({ name: 'Aile Paketi', category: 'Menuler' }), 'combo_product');
assert.equal(canCategoryAcceptProductType('Hammadde / Stok', 'sale_product'), false);
assert.equal(canCategoryAcceptProductType('Mutfak Satis', 'sale_product'), true);
assert.equal(isSellableProductType(resolveProductDomainType(baseSaleProduct)), true);
assert.equal(isSellableProductType(resolveProductDomainType(stockItem)), false);

const sellable = filterSellableProducts([baseSaleProduct, stockItem, semiProduct, comboProduct, legacyMisclassifiedSaleProduct], 'product-boundary-test');
assert.deepEqual(sellable.map((item) => item.id), ['latte', 'family-combo', 'sutlac']);

const posCatalog = buildPosCatalogFromStored([baseSaleProduct, stockItem, semiProduct, comboProduct, legacyMisclassifiedSaleProduct]);
assert.deepEqual(posCatalog.map((item) => item.id), ['latte', 'family-combo', 'sutlac']);
assert.deepEqual(posCatalog.map((item) => item.productType), ['sale_product', 'combo_product', 'sale_product']);

console.log('product domain boundary valid');
